import { applyInnerShadowFilterToGl } from './innerShadowFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

describe('applyInnerShadowFilterToGl', () => {
  it('applies a default inner shadow without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyInnerShadowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {}),
    ).not.toThrow();
  });

  it('applies with custom angle and distance', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyInnerShadowFilterToGl(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        color: 0x000000,
        alpha: 0.7,
        angle: 135,
        distance: 6,
        blurX: 4,
        blurY: 4,
      }),
    ).not.toThrow();
  });
});
