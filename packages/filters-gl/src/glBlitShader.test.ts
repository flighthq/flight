import { applyGlBlitOffsetPass, applyGlBlitPass, getGlBlitOffsetShader, getGlBlitShader } from './glBlitShader';
import { makeFilterState, makeRenderTarget } from './glTestHelper';

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
