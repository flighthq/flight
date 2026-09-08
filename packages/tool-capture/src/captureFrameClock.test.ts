import { describe, expect, it } from 'vitest';

import { CAPTURE_FRAME_DURATION_MS, getCaptureFrameTimestamp } from './captureFrameClock';

describe('capture frame clock', () => {
  it('uses a stable 60 Hz interval', () => {
    expect(CAPTURE_FRAME_DURATION_MS).toBeCloseTo(16.6666666667);
    expect(getCaptureFrameTimestamp(0)).toBe(0);
    expect(getCaptureFrameTimestamp(3)).toBeCloseTo(50);
  });

  it('normalizes invalid frame indexes to the initial timestamp', () => {
    expect(getCaptureFrameTimestamp(-1)).toBe(0);
    expect(getCaptureFrameTimestamp(Number.NaN)).toBe(0);
    expect(getCaptureFrameTimestamp(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
