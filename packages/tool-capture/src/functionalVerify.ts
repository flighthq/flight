import { createSurfaceFromWgpuRenderState, enableWgpuFrameCapture } from '@flighthq/render-wgpu';
import {
  createSurface,
  createSurfaceFingerprint,
  createSurfaceFromImageSource,
  formatSurfaceFingerprint,
  getSurfaceCoverage,
  getSurfacePixel,
} from '@flighthq/surface';
import type {
  CanvasRenderState,
  DisplayObject,
  DomRenderState,
  GlRenderState,
  Surface,
  WgpuRenderState,
} from '@flighthq/types';

import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol.js';
import type { CaptureVerification } from './captureProtocol.js';

export const FUNCTIONAL_VERIFICATION_IMAGE_KEY = '__ftRenderImage';

const DEFAULT_MIN_COVERAGE = 0.0008;
const BACKGROUND_CHANNEL_TOLERANCE = 6;
const FINGERPRINT_GRID = 16;

export type FunctionalRenderOracle = (surface: Readonly<Surface>) => void | Promise<void>;

export interface FunctionalCanvasTarget {
  kind: 'canvas';
  state: CanvasRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export interface FunctionalDomTarget {
  kind: 'dom';
  state: DomRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
}

export interface FunctionalGlTarget {
  kind: 'webgl';
  state: GlRenderState;
  width: number;
  height: number;
  scale: number;
  render(root: DisplayObject): void;
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
  render(root: DisplayObject): void;
}

export type FunctionalTarget = FunctionalCanvasTarget | FunctionalDomTarget | FunctionalGlTarget | FunctionalWgpuTarget;

type VerificationWindow = typeof window & {
  __ftRealRequestAnimationFrame?: (cb: FrameRequestCallback) => number;
  __ftRenderImage?: string;
  __ftTarget?: FunctionalTarget;
  __ftVerification?: FunctionalVerification;
};

// Synchronously reads the registered webgl target's default framebuffer and publishes it for the capture
// harness (sets __ftVerification + __ftRenderImage). Unlike runRenderVerification it does NOT wait for a
// presented frame — so it MUST be called in the same task as the draw (right after presentGlScene in an
// animation frame), while the drawing buffer is still valid. This is what lets an animated app read back
// without preserveDrawingBuffer:true (which a wait-then-read would need, and which breaks on-screen
// animation on some drivers). Returns true once a non-blank frame was published; the caller stops calling
// it then, and retries on the next frame while it returns false.
export function publishFunctionalRenderSync(render: string): boolean {
  const target = (window as VerificationWindow).__ftTarget;
  if (target?.kind !== 'webgl') return false;
  const surface = createSurfaceFromGlRenderState(target.state);
  if (surface === null) return false;
  const background = getSurfacePixel(surface, 0, 0);
  const coverage = getSurfaceCoverage(surface, background, BACKGROUND_CHANNEL_TOLERANCE);
  if (coverage < DEFAULT_MIN_COVERAGE) return false;
  (window as VerificationWindow).__ftVerification = {
    protocolVersion: CAPTURE_PROTOCOL_VERSION,
    render,
    coverage,
    fingerprint: formatSurfaceFingerprint(createSurfaceFingerprint(surface, FINGERPRINT_GRID)),
    state: 'passed',
    error: null,
  };
  (window as VerificationWindow).__ftRenderImage = encodeSurfaceToDataUrl(surface);
  return true;
}

export function registerFunctionalTarget<T extends FunctionalTarget>(target: T): T {
  (window as VerificationWindow).__ftTarget = target;
  return target;
}

export function registerWgpuFunctionalTarget(state: WgpuRenderState, scale = 1): void {
  enableWgpuFrameCapture(state);
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
      result.state = 'passed';
      return;
    }

    await waitForPresentedFrame();

    const surface = await snapshotFunctionalRender();
    if (surface === null) throw new Error(`[verify:${render}] blank render: no readable render surface`);

    const background = getSurfacePixel(surface, 0, 0);
    const coverage = getSurfaceCoverage(surface, background, BACKGROUND_CHANNEL_TOLERANCE);
    const fingerprint = formatSurfaceFingerprint(createSurfaceFingerprint(surface, FINGERPRINT_GRID));

    const minCoverage = testModule.minCoverage ?? DEFAULT_MIN_COVERAGE;
    if (coverage < minCoverage) {
      throw new Error(`[verify:${render}] blank render: coverage ${coverage.toFixed(5)} below ${minCoverage}`);
    }

    await testModule.assertRender?.(surface);
    (window as VerificationWindow).__ftRenderImage = encodeSurfaceToDataUrl(
      getFunctionalRenderImageSurface() ?? surface,
    );
    result.coverage = coverage;
    result.fingerprint = fingerprint;
    result.state = 'passed';
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.state = 'failed';
    throw error;
  }
}

export async function snapshotFunctionalRender(): Promise<Surface | null> {
  const target = (window as VerificationWindow).__ftTarget;
  if (target?.kind === 'dom') return null;
  if (target?.kind === 'webgpu') return createSurfaceFromWgpuRenderState(target.state);
  const canvas = target ? target.state.canvas : findRenderCanvas();
  if (canvas === null || canvas.width === 0 || canvas.height === 0) return null;
  if (target?.kind === 'webgl') target.state.gl.finish();
  return createSurfaceFromImageSource(canvas, canvas.width, canvas.height);
}

function getFunctionalRenderImageSurface(): Surface | null {
  const target = (window as VerificationWindow).__ftTarget;
  if (target?.kind !== 'webgl') return null;
  return createSurfaceFromGlRenderState(target.state);
}

function createSurfaceFromGlRenderState(state: GlRenderState): Surface | null {
  const canvas = state.canvas;
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) return null;

  const gl = state.gl;
  gl.finish();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const bottomUp = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);

  const surface = createSurface(width, height);
  const out = surface.data;
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * rowBytes;
    const dstRow = y * rowBytes;
    out.set(bottomUp.subarray(srcRow, srcRow + rowBytes), dstRow);
  }
  return surface;
}

function encodeSurfaceToDataUrl(surface: Readonly<Surface>): string {
  const canvas = document.createElement('canvas');
  canvas.width = surface.width;
  canvas.height = surface.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return '';
  ctx.putImageData(new ImageData(new Uint8ClampedArray(surface.data), surface.width, surface.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function findRenderCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  for (const canvas of document.querySelectorAll('canvas')) {
    if (best === null || canvas.width * canvas.height > best.width * best.height) best = canvas;
  }
  return best;
}

function waitForPresentedFrame(): Promise<void> {
  const raf = (window as VerificationWindow).__ftRealRequestAnimationFrame ?? window.requestAnimationFrame.bind(window);
  return new Promise((resolve) => {
    raf(() => raf(() => resolve()));
  });
}
