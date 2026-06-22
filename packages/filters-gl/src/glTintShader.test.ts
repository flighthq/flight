import { makeFilterState, makeRenderTarget } from './glTestHelper';
import { applyGlInvertTintPass, applyGlTintPass, getGlInvertTintShader, getGlTintShader } from './glTintShader';

describe('applyGlInvertTintPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyGlInvertTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1)).not.toThrow();
  });
});

describe('applyGlTintPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyGlTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1)).not.toThrow();
  });

  it('handles zero alpha and strength', () => {
    const { state } = makeFilterState();
    expect(() => applyGlTintPass(state, makeRenderTarget(), makeRenderTarget(), 0, 0, 0)).not.toThrow();
  });
});

describe('getGlInvertTintShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getGlInvertTintShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getGlInvertTintShader(state)).toBe(getGlInvertTintShader(state));
  });
});

describe('getGlTintShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getGlTintShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getGlTintShader(state)).toBe(getGlTintShader(state));
  });
});
