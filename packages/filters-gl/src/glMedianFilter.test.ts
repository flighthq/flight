import { applyMedianFilterToGl, MAX_MEDIAN_FILTER_GL_RADIUS } from './glMedianFilter';
import { makeFilterState, makeRenderTarget } from './glTestHelper';

describe('applyMedianFilterToGl', () => {
  it('applies with default radius without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyMedianFilterToGl(state, makeRenderTarget(), makeRenderTarget(), {})).not.toThrow();
  });

  it('applies radius 0 (pass-through) without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyMedianFilterToGl(state, makeRenderTarget(), makeRenderTarget(), { radius: 0 })).not.toThrow();
  });

  it('applies radius 2 without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyMedianFilterToGl(state, makeRenderTarget(), makeRenderTarget(), { radius: 2 })).not.toThrow();
  });

  it('clamps radius above 2', () => {
    const { state } = makeFilterState();
    expect(() => applyMedianFilterToGl(state, makeRenderTarget(), makeRenderTarget(), { radius: 5 })).not.toThrow();
  });
});

describe('MAX_MEDIAN_FILTER_GL_RADIUS', () => {
  it('is the radius-2 (5x5) cap enforced by the shader sort array', () => {
    expect(MAX_MEDIAN_FILTER_GL_RADIUS).toBe(2);
  });
});
