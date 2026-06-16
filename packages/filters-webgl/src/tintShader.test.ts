import { makeFilterState, makeRenderTarget } from './testHelper';
import {
  applyWebGLBlitOffsetPass,
  applyWebGLBlitPass,
  applyWebGLInvertTintPass,
  applyWebGLTintPass,
  getWebGLBlitOffsetShader,
  getWebGLBlitShader,
  getWebGLInvertTintShader,
  getWebGLTintShader,
} from './tintShader';

describe('applyWebGLBlitOffsetPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyWebGLBlitOffsetPass(state, source, dest, 4, 4)).not.toThrow();
  });

  it('handles zero offset', () => {
    const { state } = makeFilterState();
    expect(() => applyWebGLBlitOffsetPass(state, makeRenderTarget(), makeRenderTarget(), 0, 0)).not.toThrow();
  });
});

describe('applyWebGLBlitPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyWebGLBlitPass(state, makeRenderTarget(), makeRenderTarget())).not.toThrow();
  });
});

describe('applyWebGLInvertTintPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyWebGLInvertTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1)).not.toThrow();
  });
});

describe('applyWebGLTintPass', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyWebGLTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1)).not.toThrow();
  });

  it('handles zero alpha and strength', () => {
    const { state } = makeFilterState();
    expect(() => applyWebGLTintPass(state, makeRenderTarget(), makeRenderTarget(), 0, 0, 0)).not.toThrow();
  });
});

describe('getWebGLBlitOffsetShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getWebGLBlitOffsetShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getWebGLBlitOffsetShader(state)).toBe(getWebGLBlitOffsetShader(state));
  });
});

describe('getWebGLBlitShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getWebGLBlitShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getWebGLBlitShader(state)).toBe(getWebGLBlitShader(state));
  });
});

describe('getWebGLInvertTintShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getWebGLInvertTintShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getWebGLInvertTintShader(state)).toBe(getWebGLInvertTintShader(state));
  });
});

describe('getWebGLTintShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getWebGLTintShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getWebGLTintShader(state)).toBe(getWebGLTintShader(state));
  });
});
