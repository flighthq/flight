import type { Surface } from '@flighthq/sdk';
import {
  createSurfaceFingerprint,
  createSurfaceFromImageSource,
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
};

/**
 * Records the target a test created so the verifier can read its kind and state after rendering. Each
 * harness backend factory wraps its returned target in this. Custom-render tests that build their own
 * state do not register one, and the verifier falls back to the largest canvas on the page.
 */
export function registerFunctionalTarget<T extends FunctionalTarget>(target: T): T {
  (window as VerificationWindow).__ftTarget = target;
  return target;
}

/** Reads the rendered frame as a Surface, or null for a DOM target / when no canvas is present. */
export function snapshotFunctionalRender(): Surface | null {
  const target = (window as VerificationWindow).__ftTarget;
  if (target?.kind === 'dom') return null;
  const canvas = target && target.kind !== 'dom' ? target.state.canvas : findRenderCanvas();
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
