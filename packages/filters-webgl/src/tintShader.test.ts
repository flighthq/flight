import { makeFilterState, makeRenderTarget } from './testHelper';
import {
  applyBlitOffsetPassWebGL,
  applyBlitPassWebGL,
  applyInvertTintPassWebGL,
  applyTintPassWebGL,
  getBlitOffsetShaderWebGL,
  getBlitShaderWebGL,
  getInvertTintShaderWebGL,
  getTintShaderWebGL,
} from './tintShader';

describe('applyBlitOffsetPassWebGL', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyBlitOffsetPassWebGL(state, source, dest, 4, 4)).not.toThrow();
  });

  it('handles zero offset', () => {
    const { state } = makeFilterState();
    expect(() => applyBlitOffsetPassWebGL(state, makeRenderTarget(), makeRenderTarget(), 0, 0)).not.toThrow();
  });
});

describe('applyBlitPassWebGL', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyBlitPassWebGL(state, makeRenderTarget(), makeRenderTarget())).not.toThrow();
  });
});

describe('applyInvertTintPassWebGL', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyInvertTintPassWebGL(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1)).not.toThrow();
  });
});

describe('applyTintPassWebGL', () => {
  it('runs without throwing', () => {
    const { state } = makeFilterState();
    expect(() => applyTintPassWebGL(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1)).not.toThrow();
  });

  it('handles zero alpha and strength', () => {
    const { state } = makeFilterState();
    expect(() => applyTintPassWebGL(state, makeRenderTarget(), makeRenderTarget(), 0, 0, 0)).not.toThrow();
  });
});

describe('getBlitOffsetShaderWebGL', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getBlitOffsetShaderWebGL(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getBlitOffsetShaderWebGL(state)).toBe(getBlitOffsetShaderWebGL(state));
  });
});

describe('getBlitShaderWebGL', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getBlitShaderWebGL(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getBlitShaderWebGL(state)).toBe(getBlitShaderWebGL(state));
  });
});

describe('getInvertTintShaderWebGL', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getInvertTintShaderWebGL(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getInvertTintShaderWebGL(state)).toBe(getInvertTintShaderWebGL(state));
  });
});

describe('getTintShaderWebGL', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getTintShaderWebGL(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getTintShaderWebGL(state)).toBe(getTintShaderWebGL(state));
  });
});
