import type { Surface, WebGPURenderState } from '@flighthq/sdk';
import {
  createSurfaceFingerprint,
  createSurfaceFromImageSource,
  createSurfaceFromWebGPURenderState,
  enableWebGPUFrameCapture,
  formatSurfaceFingerprint,
  getSurfaceCoverage,
  getSurfacePixel,
} from '@flighthq/sdk';

import type { FunctionalTarget } from './target';

// In-page render verification, run by the functional entry after a test renders — and reused by the
// explorer entry for examples (gated on capture mode there, so it never runs in the deployed gallery).
// It uses the SDK's surface primitives (the same functions a test author could call) so "CI is green"
// means the renderers actually produced pixels, not merely that the page loaded:
//   - Tier 2 (not-blank): assert the frame is not still the clear colour (canvas/WebGL/WebGPU) or that
//     the DOM backend emitted elements. Throws on failure so the capture --fail-on-error gate catches
//     it; runs for every test with no per-test code.
//   - Tier 4 (oracle): run the test's optional assertRender(surface) for precise per-test checks.
// It also records a coarse fingerprint on window for the differential/regression runner (Tiers 3/5).

const DEFAULT_MIN_COVERAGE = 0.0008;
// Antialiasing fringe tolerance when measuring coverage against the (corner-sampled) background.
const BACKGROUND_CHANNEL_TOLERANCE = 6;
const FINGERPRINT_GRID = 16;

/** A per-test oracle (Tier 4): throw to fail. Receives the rendered frame as a Surface. */
export type FunctionalRenderOracle = (surface: Readonly<Surface>) => void | Promise<void>;

export interface FunctionalTestModule {
  /** Optional per-test pixel oracle, run after the not-blank check. */
  assertRender?: FunctionalRenderOracle;
  /** Minimum non-blank coverage (0..1) for this test; overrides the default. */
  minCoverage?: number;
}

interface FunctionalVerification {
  render: string;
  coverage: number | null;
  fingerprint: string | null;
}

type VerificationWindow = typeof window & {
  __ftTarget?: FunctionalTarget;
  __ftVerification?: FunctionalVerification;
  // PNG data URL of the GPU-read-back frame, set for WebGPU so the capture harness can save it as the
  // screenshot (the browser cannot screenshot the un-presented WebGPU swapchain).
  __ftRenderImage?: string;
};

// Encodes a Surface to a PNG data URL via a 2D canvas (RGBA bytes → ImageData → toDataURL).
function encodeSurfaceToDataURL(surface: Readonly<Surface>): string {
  const canvas = document.createElement('canvas');
  canvas.width = surface.width;
  canvas.height = surface.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return '';
  ctx.putImageData(new ImageData(new Uint8ClampedArray(surface.data), surface.width, surface.height), 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Records the target a test created so the verifier can read its kind and state after rendering. Each
 * harness backend factory wraps its returned target in this. Custom-render tests that build their own
 * state do not register one, and the verifier falls back to the largest canvas on the page.
 */
export function registerFunctionalTarget<T extends FunctionalTarget>(target: T): T {
  (window as VerificationWindow).__ftTarget = target;
  return target;
}

/**
 * Wires a custom-render WebGPU test for verification: enables frame capture (so the frame is rendered
 * into a readable offscreen texture — the swapchain is never presented on the headless/software adapter)
 * and registers the state as the functional target so the verifier reads it back from the GPU. Call once
 * after creating the state, before the first render. Inline-state tests need this; factory targets get it
 * automatically.
 */
export function registerWebGPUFunctionalTarget(state: WebGPURenderState, scale = 1): void {
  enableWebGPUFrameCapture(state);
  registerFunctionalTarget({
    kind: 'webgpu',
    state,
    width: state.canvas.width,
    height: state.canvas.height,
    scale,
    render: () => {},
  });
}

/**
 * Reads the rendered frame as a Surface, or null for a DOM target / when no canvas is present. WebGPU
 * is read back from the GPU (copyTextureToBuffer) rather than the canvas element: headless/software
 * adapters render correctly but never present the swapchain to the compositor, so a canvas drawImage
 * reads transparent. This requires a registered WebGPU target (the harness factory registers one).
 */
export async function snapshotFunctionalRender(): Promise<Surface | null> {
  const target = (window as VerificationWindow).__ftTarget;
  if (target?.kind === 'dom') return null;
  if (target?.kind === 'webgpu') return createSurfaceFromWebGPURenderState(target.state);
  const canvas = target ? target.state.canvas : findRenderCanvas();
  if (canvas === null || canvas.width === 0 || canvas.height === 0) return null;
  return createSurfaceFromImageSource(canvas, canvas.width, canvas.height);
}

/**
 * Verifies a render: not-blank (and an optional oracle / DOM-target check), then records a fingerprint.
 * Throws on failure (caught by the capture --fail-on-error gate). Used for functional tests and, via
 * findRenderCanvas, for explorer examples that never register a target. Reference (openfl) renderers do
 * not call this — it asserts Flight rendered correctly, not the reference.
 */
export async function runRenderVerification(testModule: FunctionalTestModule, render: string): Promise<void> {
  const result: FunctionalVerification = { render, coverage: null, fingerprint: null };
  (window as VerificationWindow).__ftVerification = result;

  if (render === 'dom') {
    // DOM renders to elements, not a canvas — never snapshot one (an example's stray bitmap canvas
    // would read blank). A registered DOM target (functional harness) lets us confirm it emitted child
    // elements or text; an explorer DOM example registers nothing, so its not-blank is skipped here —
    // Tier 1 (page errors) still gates it.
    const target = (window as VerificationWindow).__ftTarget;
    if (target?.kind === 'dom') {
      const element = target.state.element;
      const hasContent = element.childElementCount > 0 || (element.textContent ?? '').trim() !== '';
      if (!hasContent) throw new Error(`[verify:${render}] blank render — no DOM output produced`);
    }
    return;
  }

  const surface = snapshotFunctionalRender();
  if (surface === null) return; // no canvas (e.g. WebGPU unavailable) — Tier 1 (page errors) gates it

  // Not-blank: how much of the frame differs from the background. The background is the top-left pixel
  // (effectively always the clear colour), which sidesteps opaque-vs-transparent ambiguity in the
  // declared background under an alpha:false context.
  const background = getSurfacePixel(surface, 0, 0);
  const coverage = getSurfaceCoverage(surface, background, BACKGROUND_CHANNEL_TOLERANCE);
  result.coverage = coverage;
  result.fingerprint = formatSurfaceFingerprint(createSurfaceFingerprint(surface, FINGERPRINT_GRID));

  // WebGPU cannot be screenshotted by the browser (the swapchain is never presented on the headless/
  // software adapter), so expose the GPU-read-back surface as a PNG data URL for the capture harness to
  // save as screenshot.png. Canvas/WebGL screenshot normally, so this is WebGPU-only.
  if (render === 'webgpu') {
    (window as VerificationWindow).__ftRenderImage = encodeSurfaceToDataURL(surface);
  }

  const minCoverage = testModule.minCoverage ?? DEFAULT_MIN_COVERAGE;
  if (coverage < minCoverage) {
    throw new Error(`[verify:${render}] blank render — coverage ${coverage.toFixed(5)} below ${minCoverage}`);
  }

  await testModule.assertRender?.(surface);
}

// Picks the largest canvas — the render target — ignoring small helper canvases (stats overlays, etc).
function findRenderCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  for (const canvas of document.querySelectorAll('canvas')) {
    if (best === null || canvas.width * canvas.height > best.width * best.height) best = canvas;
  }
  return best;
}
