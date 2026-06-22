import { applyInnerGlowFilterToGl } from './glInnerGlowFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './glTestHelper';

describe('applyInnerGlowFilterToGl', () => {
  it('applies a default inner glow without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyInnerGlowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {}),
    ).not.toThrow();
  });

  it('applies with custom color, alpha, and blur', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyInnerGlowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        color: 0x0000ff,
        alpha: 0.9,
        blurX: 8,
        blurY: 8,
        strength: 1.5,
      }),
    ).not.toThrow();
  });
});
