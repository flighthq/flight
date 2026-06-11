import { applyDropShadowFilterToWebGL } from './dropShadowFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

describe('applyDropShadowFilterToWebGL', () => {
  it('applies a default drop shadow without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyDropShadowFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {}),
    ).not.toThrow();
  });

  it('applies with custom color, alpha, and angle', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyDropShadowFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        color: 0xff0000,
        alpha: 0.5,
        angle: 90,
        distance: 8,
        blurX: 4,
        blurY: 4,
      }),
    ).not.toThrow();
  });

  it('applies with hideObject', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyDropShadowFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        hideObject: true,
      }),
    ).not.toThrow();
  });

  it('does nothing when knockout is true', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyDropShadowFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        knockout: true,
      }),
    ).not.toThrow();
  });
});
