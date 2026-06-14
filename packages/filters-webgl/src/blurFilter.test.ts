import { applyBoxBlurFilterToWebGL, applyGaussianBlurFilterToWebGL } from './blurFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './testHelper';

describe('applyBoxBlurFilterToWebGL', () => {
  it('runs without throwing with default options', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyBoxBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, {})).not.toThrow();
  });

  it('runs without throwing with explicit sigma', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyBoxBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, { blurX: 4, blurY: 4, passes: 1 }),
    ).not.toThrow();
  });

  it('handles zero sigma (no-op blit)', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyBoxBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, { blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });

  it('runs multi-pass', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyBoxBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, { blurX: 4, blurY: 4, passes: 3 }),
    ).not.toThrow();
  });
});

describe('applyGaussianBlurFilterToWebGL', () => {
  it('runs without throwing with default options', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyGaussianBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, {})).not.toThrow();
  });

  it('runs without throwing with explicit sigma', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyGaussianBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, { blurX: 4, blurY: 8 }),
    ).not.toThrow();
  });

  it('handles zero sigma (no-op blit)', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() =>
      applyGaussianBlurFilterToWebGL(state, makeRenderTarget(), dest, temp, { blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });
});
