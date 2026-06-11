import { makeFilterState, makeRenderTarget } from './testHelper';
import { applyBlitOffsetPass, applyBlitPass, applyInvertTintPass, applyTintPass } from './tintShader';

describe('applyBlitOffsetPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitOffsetPass(state, source, dest, 4, 4)).not.toThrow();
  });

  it('handles zero offset', () => {
    const { state } = makeFilterState();
    expect(() => applyBlitOffsetPass(state, makeRenderTarget(), makeRenderTarget(), 0, 0)).not.toThrow();
  });
});

describe('applyBlitPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyBlitPass(state, makeRenderTarget(), makeRenderTarget())).not.toThrow();
  });
});

describe('applyInvertTintPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyInvertTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1)).not.toThrow();
  });
});

describe('applyTintPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1)).not.toThrow();
  });

  it('handles zero alpha and strength', () => {
    const { state } = makeFilterState();
    expect(() => applyTintPass(state, makeRenderTarget(), makeRenderTarget(), 0, 0, 0)).not.toThrow();
  });
});
