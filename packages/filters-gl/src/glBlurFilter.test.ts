import { applyBlurFilterToGl, applyBoxBlurFilterToGl, applyGaussianBlurFilterToGl } from './glBlurFilter';
import { makeFilterState, makeRenderTarget, makeScratch } from './glTestHelper';

describe('applyBlurFilterToGl', () => {
  it('applies a BlurFilter descriptor without throwing', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyBlurFilterToGl(state, makeRenderTarget(), dest, temp, {})).not.toThrow();
  });

  it('passes blurX and blurY from the descriptor', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyBlurFilterToGl(state, makeRenderTarget(), dest, temp, { blurX: 6, blurY: 3 })).not.toThrow();
  });

  it('handles zero sigma (no-op blit)', () => {
    const { state } = makeFilterState();
    const [temp, dest] = makeScratch(2);
    expect(() => applyBlurFilterToGl(state, makeRenderTarget(), dest, temp, { blurX: 0, blurY: 0 })).not.toThrow();
  });
});

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
