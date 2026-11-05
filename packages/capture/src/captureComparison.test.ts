// Generated from crates/flight-capture/tests/capture_comparison_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  CAPTURE_PARITY_TOLERANCE,
  CAPTURE_REGRESSION_TOLERANCE,
  compareCaptureFingerprints,
  evaluateCaptureParity,
  evaluateCaptureRegression,
} from './contract.ts';

const BLACK: string = '1:000000';

const NUDGE_15: string = '1:0f0000';

const NUDGE_18: string = '1:120000';

const NUDGE_45: string = '1:2d0000';

const NUDGE_48: string = '1:300000';

const WHITE: string = '1:ffffff';

describe('compareCaptureFingerprints', () => {
  it('is zero for identical fingerprints', () => {
    expect(compareCaptureFingerprints(BLACK, BLACK)).toEqual(0);
    expect(compareCaptureFingerprints(WHITE, WHITE)).toEqual(0);
  });
  it('measures the mean absolute per channel distance', () => {
    expect(compareCaptureFingerprints(BLACK, NUDGE_15)).toEqual(5);
    expect(compareCaptureFingerprints(BLACK, WHITE)).toEqual(255);
  });
  it('is infinite when either fingerprint is unparseable', () => {
    expect(compareCaptureFingerprints('not-a-fingerprint', BLACK)).toEqual(Number.POSITIVE_INFINITY);
    expect(compareCaptureFingerprints(BLACK, '')).toEqual(Number.POSITIVE_INFINITY);
  });
  it('is infinite when the grid sizes differ', () => {
    const twoByTwo = `2:${'00'.repeat(2 * 2 * 3)}`;
    expect(compareCaptureFingerprints(BLACK, twoByTwo)).toEqual(Number.POSITIVE_INFINITY);
  });
});

describe('evaluateCaptureParity', () => {
  it('defaults to the parity tolerance and passes at the boundary', () => {
    const result = evaluateCaptureParity(BLACK, NUDGE_45, undefined);
    expect(result.tolerance).toEqual(CAPTURE_PARITY_TOLERANCE);
    expect(result.difference).toEqual(15);
    expect(result.pass).toBe(true);
  });
  it('fails just past the parity tolerance', () => {
    const result = evaluateCaptureParity(BLACK, NUDGE_48, undefined);
    expect(result.difference).toEqual(16);
    expect(!result.pass).toBe(true);
  });
  it('fails on an unparseable fingerprint via the infinity sentinel', () => {
    const result = evaluateCaptureParity(BLACK, 'broken', undefined);
    expect(result.difference).toEqual(Number.POSITIVE_INFINITY);
    expect(!result.pass).toBe(true);
  });
  it('honors an explicit tolerance override', () => {
    expect(evaluateCaptureParity(BLACK, NUDGE_48, 20).pass).toBe(true);
  });
});

describe('evaluateCaptureRegression', () => {
  it('defaults to the regression tolerance and passes at the boundary', () => {
    const result = evaluateCaptureRegression(BLACK, NUDGE_15, undefined);
    expect(result.tolerance).toEqual(CAPTURE_REGRESSION_TOLERANCE);
    expect(result.difference).toEqual(5);
    expect(result.pass).toBe(true);
  });
  it('passes for an identical fingerprint', () => {
    const result = evaluateCaptureRegression(WHITE, WHITE, undefined);
    expect(result.difference).toEqual(0);
    expect(result.pass).toBe(true);
  });
  it('fails just past the regression tolerance', () => {
    const result = evaluateCaptureRegression(BLACK, NUDGE_18, undefined);
    expect(result.difference).toEqual(6);
    expect(!result.pass).toBe(true);
  });
  it('fails on an unparseable baseline via the infinity sentinel', () => {
    const result = evaluateCaptureRegression(BLACK, 'no-baseline', undefined);
    expect(result.difference).toEqual(Number.POSITIVE_INFINITY);
    expect(!result.pass).toBe(true);
  });
  it('honors an explicit tolerance override', () => {
    expect(evaluateCaptureRegression(BLACK, NUDGE_18, 10).pass).toBe(true);
  });
});
