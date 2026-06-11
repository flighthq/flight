import { applyGradientBevelFilterToWebGL } from './gradientBevelFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

const RAMP_COLORS = [0x000000, 0xffffff];
const RAMP_ALPHAS = [1, 1];
const RAMP_RATIOS = [0, 255];

describe('applyGradientBevelFilterToWebGL', () => {
  it('applies without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyGradientBevelFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        colors: RAMP_COLORS,
        alphas: RAMP_ALPHAS,
        ratios: RAMP_RATIOS,
      }),
    ).not.toThrow();
  });

  it('applies with custom angle and distance without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyGradientBevelFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        colors: RAMP_COLORS,
        alphas: RAMP_ALPHAS,
        ratios: RAMP_RATIOS,
        angle: 90,
        distance: 6,
        blurX: 4,
        blurY: 4,
      }),
    ).not.toThrow();
  });
});
