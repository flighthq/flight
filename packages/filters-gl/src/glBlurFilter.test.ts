import { applyBoxBlurFilterToGl, applyGaussianBlurFilterToGl } from './glBlurFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './glTestHelper';

describe('applyBoxBlurFilterToGl', () => {
  it('runs without throwing with default options', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyBoxBlurFilterToGl(state, makeRenderTarget(), dest, temp, {})).not.toThrow();
  });

  it('runs without throwing with explicit sigma', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyBoxBlurFilterToGl(state, makeRenderTarget(), dest, temp, { blurX: 4, blurY: 4, passes: 1 }),
    ).not.toThrow();
  });

  it('handles zero sigma (no-op blit)', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyBoxBlurFilterToGl(state, makeRenderTarget(), dest, temp, { blurX: 0, blurY: 0 })).not.toThrow();
  });

  it('runs multi-pass', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyBoxBlurFilterToGl(state, makeRenderTarget(), dest, temp, { blurX: 4, blurY: 4, passes: 3 }),
    ).not.toThrow();
  });
});

describe('applyGaussianBlurFilterToGl', () => {
  it('runs without throwing with default options', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyGaussianBlurFilterToGl(state, makeRenderTarget(), dest, temp, {})).not.toThrow();
  });

  it('runs without throwing with explicit sigma', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyGaussianBlurFilterToGl(state, makeRenderTarget(), dest, temp, { blurX: 4, blurY: 8 }),
    ).not.toThrow();
  });

  it('handles zero sigma (no-op blit)', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyGaussianBlurFilterToGl(state, makeRenderTarget(), dest, temp, { blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });
});
