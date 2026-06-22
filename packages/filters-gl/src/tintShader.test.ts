import { makeFilterState, makeRenderTarget } from './testHelper';
import {
  applyGlBlitOffsetPass,
  applyGlBlitPass,
  applyGlInvertTintPass,
  applyGlTintPass,
  getGlBlitOffsetShader,
  getGlBlitShader,
  getGlInvertTintShader,
  getGlTintShader,
} from './tintShader';

describe('applyGlBlitOffsetPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyGlBlitOffsetPass(state, source, dest, 4, 4)).not.toThrow();
  });

  it('handles zero offset', () => {
    const { state } = makeFilterState();
    expect(() => applyGlBlitOffsetPass(state, makeRenderTarget(), makeRenderTarget(), 0, 0)).not.toThrow();
  });
});

describe('applyGlBlitPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyGlBlitPass(state, makeRenderTarget(), makeRenderTarget())).not.toThrow();
  });
});

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

describe('getGlBlitOffsetShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getGlBlitOffsetShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getGlBlitOffsetShader(state)).toBe(getGlBlitOffsetShader(state));
  });
});

describe('getGlBlitShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getGlBlitShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getGlBlitShader(state)).toBe(getGlBlitShader(state));
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
