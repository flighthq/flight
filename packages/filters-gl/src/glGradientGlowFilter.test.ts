import { applyGradientGlowFilterToGl } from './glGradientGlowFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './glTestHelper';

const RAMP_COLORS = [0xff0000, 0x0000ff];
const RAMP_ALPHAS = [1, 1];
const RAMP_RATIOS = [0, 255];

describe('applyGradientGlowFilterToGl', () => {
  it('applies without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyGradientGlowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        colors: RAMP_COLORS,
        alphas: RAMP_ALPHAS,
        ratios: RAMP_RATIOS,
      }),
    ).not.toThrow();
  });

  it('applies with custom blur and strength without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyGradientGlowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        colors: RAMP_COLORS,
        alphas: RAMP_ALPHAS,
        ratios: RAMP_RATIOS,
        blurX: 8,
        blurY: 8,
        strength: 2,
      }),
    ).not.toThrow();
  });
});
