// Generated from crates/flight-capture/src/capture_comparison.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { compareBitmapFingerprints, parseBitmapFingerprint } from '@flighthq/bitmap/contract';

import type { CaptureCheckResult } from './types.ts';

/**
 * The tolerant distance between two coarse render fingerprints in `<gridSize>:<hex>` text form:
 * the mean absolute per-channel difference (0..255). Returns `f64::INFINITY` when either string
 * fails to parse, or when the fingerprints use different grid sizes and are not comparable.
 */
export function compareCaptureFingerprints(a: string, b: string): number {
  let first = parseBitmapFingerprint(a) ?? undefined;
  let second = parseBitmapFingerprint(b) ?? undefined;
  const $t0 = first;
  const $t1 = second;
  if ($t0 === undefined || $t1 === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  first = $t0;
  second = $t1;
  if (first.gridSize !== second.gridSize) {
    return Number.POSITIVE_INFINITY;
  }
  return compareBitmapFingerprints(first, second);
}

/**
 * Whether two render backends rendering the same scene in the same run agree within `tolerance`.
 * Environment-independent: it needs no committed baseline, only the two live fingerprints.
 */
export function evaluateCaptureParity(a: string, b: string, tolerance?: number): CaptureCheckResult {
  tolerance = tolerance ?? CAPTURE_PARITY_TOLERANCE;
  const difference = compareCaptureFingerprints(a, b);
  return { pass: difference <= tolerance, difference, tolerance };
}

/**
 * Whether a freshly captured `fingerprint` still matches its own committed
 * `baselineFingerprint` within `tolerance`.
 */
export function evaluateCaptureRegression(
  fingerprint: string,
  baselineFingerprint: string,
  tolerance?: number,
): CaptureCheckResult {
  tolerance = tolerance ?? CAPTURE_REGRESSION_TOLERANCE;
  const difference = compareCaptureFingerprints(fingerprint, baselineFingerprint);
  return { pass: difference <= tolerance, difference, tolerance };
}

export const CAPTURE_PARITY_TOLERANCE = 15;
export const CAPTURE_REGRESSION_TOLERANCE = 5;
