import { describe, expect, it } from 'vitest';

import {
  CAPTURE_PARITY_TOLERANCE,
  CAPTURE_REGRESSION_TOLERANCE,
  compareCaptureFingerprints,
  evaluateCaptureParity,
  evaluateCaptureRegression,
} from './captureComparison';

// Short 1x1 fingerprints: `1:<rr><gg><bb>`, three RGB bytes as six hex chars. The per-channel mean
// distance is (|dR| + |dG| + |dB|) / 3, so a single channel offset of N produces a distance of N / 3.
const BLACK = '1:000000';
const NUDGE_15 = '1:0f0000'; // dR = 15 -> distance 5   (== regression tolerance)
const NUDGE_18 = '1:120000'; // dR = 18 -> distance 6   (>  regression tolerance)
const NUDGE_45 = '1:2d0000'; // dR = 45 -> distance 15  (== parity tolerance)
const NUDGE_48 = '1:300000'; // dR = 48 -> distance 16  (>  parity tolerance)
const WHITE = '1:ffffff'; // distance 255 from black

describe('compareCaptureFingerprints', () => {
  it('is 0 for identical fingerprints', () => {
    expect(compareCaptureFingerprints(BLACK, BLACK)).toBe(0);
    expect(compareCaptureFingerprints(WHITE, WHITE)).toBe(0);
  });

  it('measures the mean absolute per-channel distance', () => {
    expect(compareCaptureFingerprints(BLACK, NUDGE_15)).toBe(5);
    expect(compareCaptureFingerprints(BLACK, WHITE)).toBe(255);
  });

  it('returns Infinity when either fingerprint is unparseable', () => {
    expect(compareCaptureFingerprints('not-a-fingerprint', BLACK)).toBe(Number.POSITIVE_INFINITY);
    expect(compareCaptureFingerprints(BLACK, '')).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns Infinity when the grid sizes differ and are not comparable', () => {
    const twoByTwo = '2:' + '00'.repeat(2 * 2 * 3);
    expect(compareCaptureFingerprints(BLACK, twoByTwo)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('evaluateCaptureParity', () => {
  it('defaults to the parity tolerance and passes at the boundary', () => {
    const result = evaluateCaptureParity(BLACK, NUDGE_45);
    expect(result.tolerance).toBe(CAPTURE_PARITY_TOLERANCE);
    expect(result.difference).toBe(15);
    expect(result.pass).toBe(true);
  });

  it('fails just past the parity tolerance', () => {
    const result = evaluateCaptureParity(BLACK, NUDGE_48);
    expect(result.difference).toBe(16);
    expect(result.pass).toBe(false);
  });

  it('fails on an unparseable fingerprint via the Infinity sentinel', () => {
    const result = evaluateCaptureParity(BLACK, 'broken');
    expect(result.difference).toBe(Number.POSITIVE_INFINITY);
    expect(result.pass).toBe(false);
  });

  it('honors an explicit tolerance override', () => {
    expect(evaluateCaptureParity(BLACK, NUDGE_48, 20).pass).toBe(true);
  });
});

describe('evaluateCaptureRegression', () => {
  it('defaults to the regression tolerance and passes at the boundary', () => {
    const result = evaluateCaptureRegression(BLACK, NUDGE_15);
    expect(result.tolerance).toBe(CAPTURE_REGRESSION_TOLERANCE);
    expect(result.difference).toBe(5);
    expect(result.pass).toBe(true);
  });

  it('passes for an identical fingerprint', () => {
    const result = evaluateCaptureRegression(WHITE, WHITE);
    expect(result.difference).toBe(0);
    expect(result.pass).toBe(true);
  });

  it('fails just past the regression tolerance', () => {
    const result = evaluateCaptureRegression(BLACK, NUDGE_18);
    expect(result.difference).toBe(6);
    expect(result.pass).toBe(false);
  });

  it('fails on an unparseable baseline via the Infinity sentinel', () => {
    const result = evaluateCaptureRegression(BLACK, 'no-baseline');
    expect(result.difference).toBe(Number.POSITIVE_INFINITY);
    expect(result.pass).toBe(false);
  });

  it('honors an explicit tolerance override', () => {
    expect(evaluateCaptureRegression(BLACK, NUDGE_18, 10).pass).toBe(true);
  });
});
