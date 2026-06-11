import { applyDisplacementMapFilterToWebGL } from './displacementMapFilter';
import { makeFilterState, makeRenderTarget } from './testHelper';

describe('applyDisplacementMapFilterToWebGL', () => {
  it('applies with default options without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyDisplacementMapFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeRenderTarget(), {}),
    ).not.toThrow();
  });

  it('applies with all displacement modes without throwing', () => {
    const { state } = makeFilterState();
    for (const mode of ['wrap', 'clamp', 'ignore', 'color'] as const) {
      expect(() =>
        applyDisplacementMapFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeRenderTarget(), {
          mode,
          componentX: 0,
          componentY: 1,
          scaleX: 20,
          scaleY: 20,
        }),
      ).not.toThrow();
    }
  });
});
