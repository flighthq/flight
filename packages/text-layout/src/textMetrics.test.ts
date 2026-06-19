import type { TextLayoutResult } from '@flighthq/types';

import { createTextMetrics, getTextMetrics } from './textMetrics';

describe('createTextMetrics', () => {
  it('creates a zeroed metrics object', () => {
    expect(createTextMetrics()).toEqual({ height: 0, numLines: 0, width: 0 });
  });
});

describe('getTextMetrics', () => {
  it('fills the measured content size from a layout, ceiling fractional extents', () => {
    const out = createTextMetrics();
    getTextMetrics(out, { numLines: 2, textHeight: 8.7, textWidth: 12.2 } as unknown as TextLayoutResult);
    expect(out.width).toBe(13);
    expect(out.height).toBe(9);
    expect(out.numLines).toBe(2);
  });
});
