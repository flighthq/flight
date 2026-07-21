import { compareSurfaceFingerprints, parseSurfaceFingerprint } from '@flighthq/surface/surfaceFingerprint';
import type { CaptureCheckResult } from '@flighthq/types';

// Default parity tolerance (mean absolute per-channel difference, 0..255). Cross-backend agreement is
// ≤ ~6.5 even for antialiasing-heavy scenes, so real divergence between two backends is well over 15.
export const CAPTURE_PARITY_TOLERANCE = 15;

// Default regression tolerance (mean absolute per-channel difference, 0..255). Same-backend run-to-run
// noise for a stable test is well under 5, so a target that drifts past this against its own committed
// baseline is a real visual regression, not antialiasing jitter.
export const CAPTURE_REGRESSION_TOLERANCE = 5;

/**
 * The tolerant distance between two coarse render fingerprints in `<gridSize>:<hex>` text form (see
 * formatSurfaceFingerprint): the mean absolute per-channel difference (0..255), where ~0 is identical
 * and larger values mean a real visual change. Returns `Number.POSITIVE_INFINITY` as a sentinel when
 * either string fails to parse, or when the two fingerprints use different grid sizes and so are not
 * comparable — Infinity fails any finite tolerance, so a corrupt or mismatched baseline reads as a
 * failing check rather than crashing.
 */
export function compareCaptureFingerprints(a: string, b: string): number {
  const fa = parseSurfaceFingerprint(a);
  const fb = parseSurfaceFingerprint(b);
  if (fa === null || fb === null || fa.gridSize !== fb.gridSize) return Number.POSITIVE_INFINITY;
  return compareSurfaceFingerprints(fa, fb);
}

/**
 * Parity: whether two render backends rendering the same scene in the same run agree within
 * `tolerance`. Environment-independent — it needs no committed baseline, only the two live
 * fingerprints. `difference` is the tolerant distance (Infinity when either fingerprint is
 * unparseable); `pass` is `difference <= tolerance`.
 */
export function evaluateCaptureParity(a: string, b: string, tolerance = CAPTURE_PARITY_TOLERANCE): CaptureCheckResult {
  const difference = compareCaptureFingerprints(a, b);
  return { pass: difference <= tolerance, difference, tolerance };
}

/**
 * Regression: whether a freshly captured `fingerprint` still matches its own committed
 * `baselineFingerprint` within `tolerance`. `difference` is the tolerant distance (Infinity when
 * either fingerprint is unparseable); `pass` is `difference <= tolerance`.
 */
export function evaluateCaptureRegression(
  fingerprint: string,
  baselineFingerprint: string,
  tolerance = CAPTURE_REGRESSION_TOLERANCE,
): CaptureCheckResult {
  const difference = compareCaptureFingerprints(fingerprint, baselineFingerprint);
  return { pass: difference <= tolerance, difference, tolerance };
}
