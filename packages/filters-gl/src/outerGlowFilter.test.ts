import { applyOuterGlowFilterToGl } from './outerGlowFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

describe('applyOuterGlowFilterToGl', () => {
  it('applies a default outer glow without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyOuterGlowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {}),
    ).not.toThrow();
  });

  it('applies with custom color and strength', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyOuterGlowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        color: 0x00ff00,
        alpha: 0.8,
        blurX: 6,
        blurY: 6,
        strength: 2,
      }),
    ).not.toThrow();
  });

  it('applies with knockout', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyOuterGlowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        knockout: true,
      }),
    ).not.toThrow();
  });
});
