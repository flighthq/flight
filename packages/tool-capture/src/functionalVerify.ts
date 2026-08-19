import {
  createBitmap,
  createBitmapFingerprint,
  createBitmapFromImageSource,
  formatBitmapFingerprint,
  getBitmapCoverage,
  getBitmapPixel,
} from '@flighthq/bitmap/contract';
import { enableWgpuRenderEffectGuards } from '@flighthq/effects-wgpu/contract';
import { createBitmapFromWgpuRenderState, enableWgpuFrameCapture } from '@flighthq/render-wgpu/contract';
import type {
  CanvasRenderState,
  Node2D,
  DomRenderState,
  GlRenderState,
  Bitmap,
  WgpuRenderState,
} from '@flighthq/types/contract';

import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol.js';
import type { CaptureBenchmarkTarget, CaptureVerification } from './captureProtocol.js';

export const FUNCTIONAL_VERIFICATION_IMAGE_KEY = '__ftRenderImage';

const DEFAULT_MIN_COVERAGE = 0.0008;
const BACKGROUND_CHANNEL_TOLERANCE = 6;
const FINGERPRINT_GRID = 16;

// Shares of the runner's per-page budget, not fixed milliseconds. Both of the verifier's waits expire
// inside the runner's outer wait — a bound that fires after it is never seen, and the run reports the
// bare stalled `pending` it was meant to replace — so the worst case (a full frame wait followed by a
// stalled readback) must sum below that ceiling with room left to publish the failure. That invariant
// is relative, which is exactly why these cannot be constants: written as 4s and 8s they encoded a 15s
// ceiling, and when the ceiling moved to give a contended runner more room, they silently kept the old
// one and converted slow-but-working readbacks into hard failures.
//
// Same rule captureTimeout.ts states for the runner-side waits, now covering the page's: one number
// governs all of them, and moving it moves them together.
const PRESENTED_FRAME_BUDGET_SHARE = 4 / 15;
const READBACK_BUDGET_SHARE = 8 / 15;
const FALLBACK_CAPTURE_TIMEOUT_MS = 45_000;

interface FunctionalDomReadback {
  data: Uint8ClampedArray;
  height: number;
  width: number;
}

export type FunctionalRenderOracle = (bitmap: Readonly<Bitmap>) => void | Promise<void>;

export interface FunctionalCanvasTarget {
  kind: 'canvas';
  state: CanvasRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: Node2D): void;
  benchmark?(root: Node2D): void | Promise<void>;
}

export interface FunctionalDomTarget {
  kind: 'dom';
  state: DomRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: Node2D): void;
  benchmark?(root: Node2D): void | Promise<void>;
}

export interface FunctionalGlTarget {
  kind: 'webgl';
  state: GlRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: Node2D): void;
  benchmark?(root: Node2D): void | Promise<void>;
}

export interface FunctionalTestModule {
  assertRender?: FunctionalRenderOracle;
  minCoverage?: number;
}

/** @deprecated Prefer the protocol-neutral CaptureVerification name. */
export type FunctionalVerification = CaptureVerification;

export interface FunctionalWgpuTarget {
  kind: 'webgpu';
  state: WgpuRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: Node2D): void;
  benchmark?(root: Node2D): void | Promise<void>;
}

export type FunctionalTarget = FunctionalCanvasTarget | FunctionalDomTarget | FunctionalGlTarget | FunctionalWgpuTarget;

type VerificationWindow = typeof window & {
  __ftCaptureTimeoutMs?: number;
  __ftProvideDomRenderPixels?: (readback: FunctionalDomReadback | null) => void;
  __ftRealRequestAnimationFrame?: (cb: FrameRequestCallback) => number;
  __ftRenderImage?: string;
  __ftTarget?: FunctionalTarget;
  __ftBenchmarkTarget?: CaptureBenchmarkTarget;
  __ftVerification?: FunctionalVerification;
};

// Synchronously reads the registered webgl target's default framebuffer and publishes it for the capture
// harness (sets __ftVerification + __ftRenderImage). Unlike runRenderVerification it does NOT wait for a
// presented frame — so it MUST be called in the same task as the draw (right after presentGlScene3D in an
// animation frame), while the drawing buffer is still valid. This is what lets an animated app read back
// without preserveDrawingBuffer:true (which a wait-then-read would need, and which breaks on-screen
// animation on some drivers). Returns true once a non-blank frame was published; the caller stops calling
// it then, and retries on the next frame while it returns false.
export function publishFunctionalRenderSync(render: string): boolean {
  const target = (window as VerificationWindow).__ftTarget;
  if (target?.kind !== 'webgl') return false;
  const bitmap = createBitmapFromGlRenderState(target.state);
  if (bitmap === null) return false;
  const background = getBitmapPixel(bitmap, 0, 0);
  const coverage = getBitmapCoverage(bitmap, background, BACKGROUND_CHANNEL_TOLERANCE);
  if (coverage < DEFAULT_MIN_COVERAGE) return false;
  (window as VerificationWindow).__ftVerification = {
    protocolVersion: CAPTURE_PROTOCOL_VERSION,
    render,
    coverage,
    fingerprint: formatBitmapFingerprint(createBitmapFingerprint(bitmap, FINGERPRINT_GRID)),
    state: 'passed',
    stage: 'done',
    error: null,
  };
  (window as VerificationWindow).__ftRenderImage = encodeBitmapToDataUrl(bitmap);
  return true;
}

export function registerFunctionalTarget<T extends FunctionalTarget>(target: T): T {
  const captureWindow = window as VerificationWindow;
  const render = target.render.bind(target);
  let lastRoot: Node2D | undefined;
  const benchmarkTarget: CaptureBenchmarkTarget = {
    protocolVersion: CAPTURE_PROTOCOL_VERSION,
    ready: false,
    kind: target.kind,
    run(): void | Promise<void> {
      if (lastRoot === undefined) throw new Error(`benchmark target ${target.kind} has not rendered its first frame`);
      return target.benchmark === undefined ? render(lastRoot) : target.benchmark(lastRoot);
    },
    async synchronize(): Promise<void> {
      if (target.kind === 'webgl') {
        target.state.gl.finish();
      } else if (target.kind === 'webgpu') {
        await target.state.device.queue.onSubmittedWorkDone();
      } else if (target.kind === 'dom') {
        // Forces pending style/layout work without adding a frame-duration floor to every sample.
        target.state.element.getBoundingClientRect();
      }
    },
  };
  target.render = (root: Node2D): void => {
    lastRoot = root;
    benchmarkTarget.ready = true;
    render(root);
  };
  captureWindow.__ftTarget = target;
  captureWindow.__ftBenchmarkTarget = benchmarkTarget;
  return target;
}

export function registerWgpuFunctionalTarget(state: WgpuRenderState, scale = 1): void {
  enableWgpuFrameCapture(state);
  // Every functional WGPU scene passes through here, INCLUDING the ~100 that build their own render
  // state instead of going through the harness — which is where the sampleCount requests live. Without
  // this, `createWgpuRenderEffectPipeline` downgrades a requested sampleCount of 4 to 1 in silence, and
  // a capture of a scene that asked for MSAA is indistinguishable from one that got it.
  enableWgpuRenderEffectGuards(state);
  registerFunctionalTarget({
    kind: 'webgpu',
    state,
    width: state.canvas.width,
    height: state.canvas.height,
    scale,
    render: () => {},
  });
}

export async function runRenderVerification(testModule: FunctionalTestModule, render: string): Promise<void> {
  const result: FunctionalVerification = {
    protocolVersion: CAPTURE_PROTOCOL_VERSION,
    render,
    coverage: null,
    fingerprint: null,
    state: 'pending',
    stage: 'awaitingFrame',
    error: null,
  };
  (window as VerificationWindow).__ftVerification = result;

  try {
    if (render === 'dom') {
      const target = (window as VerificationWindow).__ftTarget;
      if (target?.kind !== 'dom') throw new Error(`[verify:${render}] blank render: no DOM target registered`);
      const element = target.state.element;
      const hasContent = element.childElementCount > 0 || (element.textContent ?? '').trim() !== '';
      if (!hasContent) throw new Error(`[verify:${render}] blank render: no DOM output produced`);
    }

    // Canvas/WebGL read pixels out of the presented canvas, so wait for the browser to hand over a frame
    // first. WebGPU's retained capture buffer is already resident; DOM is synchronized by the element
    // screenshot that supplies its pixels. Waiting buys nothing for either and costs a dependency on the
    // browser still scheduling frames after the deterministic capture halt.
    if (render !== 'dom' && render !== 'webgpu') {
      await waitForPresentedFrame(render, getCaptureWaitBudgetMs(PRESENTED_FRAME_BUDGET_SHARE));
    }

    result.stage = 'readingBack';
    // Browser page JavaScript has no API that rasterizes an arbitrary DOM subtree. The Playwright-side
    // runner therefore screenshots the registered element and supplies its RGBA bytes through this
    // one-shot bridge. From this point on DOM uses the same bitmap coverage, scene oracle, and
    // fingerprint legs as the canvas/GPU backends; merely finding a child element is not a pass.
    const bitmap =
      render === 'dom'
        ? await waitForDomRenderPixels(getCaptureWaitBudgetMs(READBACK_BUDGET_SHARE))
        : await snapshotFunctionalRender();
    if (bitmap === null) throw new Error(`[verify:${render}] blank render: no readable render bitmap`);

    result.stage = 'measuring';
    const background = getBitmapPixel(bitmap, 0, 0);
    const coverage = getBitmapCoverage(bitmap, background, BACKGROUND_CHANNEL_TOLERANCE);
    const fingerprint = formatBitmapFingerprint(createBitmapFingerprint(bitmap, FINGERPRINT_GRID));

    const minCoverage = testModule.minCoverage ?? DEFAULT_MIN_COVERAGE;
    if (coverage < minCoverage) {
      throw new Error(`[verify:${render}] blank render: coverage ${coverage.toFixed(5)} below ${minCoverage}`);
    }

    result.stage = 'asserting';
    // Record INVOCATION, not existence — and record it from the branch that actually calls, so the fact
    // cannot drift from the behaviour it describes.
    const oracle = testModule.assertRender;
    if (typeof oracle === 'function') {
      result.oracle = 'invoked';
      await oracle(bitmap);
    } else {
      result.oracle = 'absent';
    }
    result.stage = 'encoding';
    // DOM capture already owns the Playwright screenshot that supplied this bitmap. Publishing another
    // PNG would only re-encode those pixels; the raster backends still need this data URL because their
    // compositor screenshots may be blank or unavailable.
    if (render !== 'dom') {
      (window as VerificationWindow).__ftRenderImage = encodeBitmapToDataUrl(
        getFunctionalRenderImageBitmap() ?? bitmap,
      );
    }
    result.coverage = coverage;
    result.fingerprint = fingerprint;
    result.stage = 'done';
    result.state = 'passed';
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.state = 'failed';
    throw error;
  }
}

export async function snapshotFunctionalRender(): Promise<Bitmap | null> {
  const target = (window as VerificationWindow).__ftTarget;
  if (target?.kind === 'dom') return null;
  if (target?.kind === 'webgpu') {
    return createBitmapFromWgpuRenderState(target.state, getCaptureWaitBudgetMs(READBACK_BUDGET_SHARE));
  }
  const canvas = target ? target.state.canvas : findRenderCanvas();
  if (canvas === null || canvas.width === 0 || canvas.height === 0) return null;
  if (target?.kind === 'webgl') target.state.gl.finish();
  return createBitmapFromImageSource(canvas, canvas.width, canvas.height);
}

function waitForDomRenderPixels(timeoutMs: number): Promise<Bitmap | null> {
  const captureWindow = window as VerificationWindow;
  return new Promise((resolve) => {
    let settled = false;
    const provide = (readback: FunctionalDomReadback | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (captureWindow.__ftProvideDomRenderPixels === provide) {
        captureWindow.__ftProvideDomRenderPixels = undefined;
      }
      if (
        readback === null ||
        readback.width <= 0 ||
        readback.height <= 0 ||
        readback.data.length !== readback.width * readback.height * 4
      ) {
        resolve(null);
        return;
      }
      const bitmap = createBitmap(readback.width, readback.height);
      bitmap.data.set(readback.data);
      resolve(bitmap);
    };
    const timer = setTimeout(() => provide(null), timeoutMs);
    captureWindow.__ftProvideDomRenderPixels = provide;
  });
}

function getFunctionalRenderImageBitmap(): Bitmap | null {
  const target = (window as VerificationWindow).__ftTarget;
  if (target?.kind !== 'webgl') return null;
  return createBitmapFromGlRenderState(target.state);
}

function createBitmapFromGlRenderState(state: GlRenderState): Bitmap | null {
  const canvas = state.canvas;
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) return null;

  const gl = state.gl;
  gl.finish();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const bottomUp = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);

  const bitmap = createBitmap(width, height);
  const out = bitmap.data;
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * rowBytes;
    const dstRow = y * rowBytes;
    out.set(bottomUp.subarray(srcRow, srcRow + rowBytes), dstRow);
  }
  return bitmap;
}

function encodeBitmapToDataUrl(bitmap: Readonly<Bitmap>): string {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return '';
  ctx.putImageData(new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function findRenderCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  for (const canvas of document.querySelectorAll('canvas')) {
    if (best === null || canvas.width * canvas.height > best.width * best.height) best = canvas;
  }
  return best;
}

// Waits for two animation frames, or fails by name once `timeoutMs` passes. The wait itself is not
// guaranteed to end: the harness stashes the real rAF here precisely because the page's own rAF stops
// firing at the halt frame, and a browser under a contended software adapter can stop delivering frames
// for a canvas nothing composites. Without the bound the verifier sits in `awaitingFrame` until the
// runner's outer wait gives up and reports the useless `state: pending` — the bound turns that into a
// failure that names the await it died in, and a failure can pass on retry where a hang cannot.
// One wait's slice of the budget the runner gave this page. The runner injects that budget before any
// page script runs (captureBrowser's init script); a page opened outside the harness has no injected
// value and falls back to the runner's own default, which is why the number below is duplicated rather
// than imported — captureTimeout.ts resolves it from process/CLI and cannot load in a browser page.
// Keep the fallback in step with DEFAULT_CAPTURE_TIMEOUT_MS there.
function getCaptureWaitBudgetMs(share: number): number {
  const injected = (window as VerificationWindow).__ftCaptureTimeoutMs;
  const budget =
    typeof injected === 'number' && Number.isFinite(injected) && injected > 0 ? injected : FALLBACK_CAPTURE_TIMEOUT_MS;
  return Math.round(budget * share);
}

function waitForPresentedFrame(render: string, timeoutMs: number): Promise<void> {
  const raf = (window as VerificationWindow).__ftRealRequestAnimationFrame ?? window.requestAnimationFrame.bind(window);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`[verify:${render}] stalled in stage awaitingFrame: no animation frame within ${timeoutMs}ms`));
    }, timeoutMs);
    raf(() =>
      raf(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      }),
    );
  });
}
