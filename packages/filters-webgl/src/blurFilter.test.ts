import { applyBlurFilterToWebGL, boxRadiusForSigmaWebGL } from './blurFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

describe('applyBlurFilterToWebGL', () => {
  it('runs without throwing with default options', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, {})).not.toThrow();
  });

  it('runs without throwing with explicit sigma', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, { blurX: 4, blurY: 4, quality: 1 }),
    ).not.toThrow();
  });

  it('handles zero sigma (no-op blit)', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, { blurX: 0, blurY: 0 })).not.toThrow();
  });

  it('runs multi-pass quality', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, { blurX: 4, blurY: 4, quality: 3 }),
    ).not.toThrow();
  });
});

describe('boxRadiusForSigmaWebGL', () => {
  it('returns 0 for sigma <= 0', () => {
    expect(boxRadiusForSigmaWebGL(0, 1)).toBe(0);
    expect(boxRadiusForSigmaWebGL(-1, 1)).toBe(0);
  });

  it('returns a positive radius for positive sigma', () => {
    expect(boxRadiusForSigmaWebGL(4, 1)).toBeGreaterThan(0);
  });

  it('returns a smaller radius for more passes at the same sigma', () => {
    const r1 = boxRadiusForSigmaWebGL(4, 1);
    const r3 = boxRadiusForSigmaWebGL(4, 3);
    expect(r3).toBeLessThanOrEqual(r1);
  });
});
