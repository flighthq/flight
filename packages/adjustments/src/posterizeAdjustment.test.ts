import { createPosterizeAdjustment } from './posterizeAdjustment';

describe('createPosterizeAdjustment', () => {
  it('quantizes each channel to the given number of levels', () => {
    const adjustment = createPosterizeAdjustment({ levels: 2 });
    expect(adjustment.kind).toBe('PosterizeAdjustment');
    const out: [number, number, number] = [0, 0, 0];
    // levels 2: floor(v·2)/1 → 0 for v<0.5, 1 for v>=0.5.
    adjustment.transform(out, 0.2, 0.6, 0.99);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(1, 5);
  });

  it('clamps degenerate level counts to at least 2', () => {
    const adjustment = createPosterizeAdjustment({ levels: 1 });
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 0.7, 0.7, 0.7);
    expect(out[0]).toBeCloseTo(1, 5);
  });
});
