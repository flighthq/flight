import { makeFilterState, makeRenderTarget } from './testHelper';
import {
  applyBlitOffsetPass,
  applyBlitPass,
  applyInvertTintPass,
  applyTintPass,
  getBlitOffsetShader,
  getBlitShader,
  getInvertTintShader,
  getTintShader,
} from './tintShader';

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

describe('getBlitOffsetShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getBlitOffsetShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getBlitOffsetShader(state)).toBe(getBlitOffsetShader(state));
  });
});

describe('getBlitShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getBlitShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getBlitShader(state)).toBe(getBlitShader(state));
  });
});

describe('getInvertTintShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getInvertTintShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getInvertTintShader(state)).toBe(getInvertTintShader(state));
  });
});

describe('getTintShader', () => {
  it('returns shader locations', () => {
    const { state } = makeFilterState();
    const loc = getTintShader(state);
    expect(loc).toBeDefined();
    expect(loc.program).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const { state } = makeFilterState();
    expect(getTintShader(state)).toBe(getTintShader(state));
  });
});
