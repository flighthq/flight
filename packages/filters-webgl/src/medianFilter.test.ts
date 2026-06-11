import { applyMedianFilterToWebGL } from './medianFilter';
import { makeFilterState, makeRenderTarget } from './testHelper';

describe('applyMedianFilterToWebGL', () => {
  it('applies with default radius without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyMedianFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), {})).not.toThrow();
  });

  it('applies radius 0 (pass-through) without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyMedianFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), { radius: 0 })).not.toThrow();
  });

  it('applies radius 2 without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyMedianFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), { radius: 2 })).not.toThrow();
  });

  it('clamps radius above 2', () => {
    const { state } = makeFilterState();
    expect(() => applyMedianFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), { radius: 5 })).not.toThrow();
  });
});
