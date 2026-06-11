import { applyBevelFilterToWebGL } from './bevelFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

describe('applyBevelFilterToWebGL', () => {
  it('applies a default bevel without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyBevelFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {}),
    ).not.toThrow();
  });

  it('applies bevelType inner without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyBevelFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        bevelType: 'inner',
      }),
    ).not.toThrow();
  });

  it('applies bevelType outer without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyBevelFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        bevelType: 'outer',
      }),
    ).not.toThrow();
  });

  it('applies with knockout', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyBevelFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), {
        knockout: true,
      }),
    ).not.toThrow();
  });
});
