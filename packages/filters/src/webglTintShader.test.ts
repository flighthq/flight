import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import {
  applyBlitOffsetPass,
  applyBlitPass,
  applyTintPass,
  getBlitOffsetShader,
  getBlitShader,
  getTintShader,
} from './webglTintShader';

describe('applyBlitOffsetPass', () => {
  it('calls drawElements once', () => {
    const { state, gl } = makeWebGLState();
    applyBlitOffsetPass(state, makeRenderTarget(100, 50), makeRenderTarget(), 0, 0);
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('passes the screen-space offset as UV offset (-dx/w, dy/h)', () => {
    const { state, gl } = makeWebGLState();
    const source = makeRenderTarget(100, 50);
    applyBlitOffsetPass(state, source, makeRenderTarget(), 10, 5);
    expect(gl.uniform2f).toHaveBeenCalledWith(expect.anything(), -10 / 100, 5 / 50);
  });
});

describe('applyBlitPass', () => {
  it('calls drawElements once', () => {
    const { state, gl } = makeWebGLState();
    applyBlitPass(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('binds the source texture', () => {
    const { state, gl } = makeWebGLState();
    const source = makeRenderTarget();
    applyBlitPass(state, source, makeRenderTarget());
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as any).TEXTURE_2D, source.texture);
  });
});

describe('applyTintPass', () => {
  it('calls drawElements once', () => {
    const { state, gl } = makeWebGLState();
    applyTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff0000, 1, 1);
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('decomposes the color into normalized RGB components', () => {
    const { state, gl } = makeWebGLState();
    // 0xff8040: R=255 G=128 B=64
    applyTintPass(state, makeRenderTarget(), makeRenderTarget(), 0xff8040, 0.5, 2);
    expect(gl.uniform3f).toHaveBeenCalledWith(expect.anything(), 1, 128 / 255, 64 / 255);
  });

  it('forwards alpha and strength as separate uniforms', () => {
    const { state, gl } = makeWebGLState();
    applyTintPass(state, makeRenderTarget(), makeRenderTarget(), 0, 0.75, 3);
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 0.75);
    expect(gl.uniform1f).toHaveBeenCalledWith(expect.anything(), 3);
  });
});

describe('getBlitOffsetShader', () => {
  it('compiles on first call', () => {
    const { state, gl } = makeWebGLState();
    const loc = getBlitOffsetShader(state);
    expect(loc.program).toBeDefined();
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
  });

  it('returns the cached shader on repeated calls', () => {
    const { state } = makeWebGLState();
    const loc1 = getBlitOffsetShader(state);
    const loc2 = getBlitOffsetShader(state);
    expect(loc1).toBe(loc2);
  });

  it('returns independent shaders for different states', () => {
    const { state: stateA } = makeWebGLState();
    const { state: stateB } = makeWebGLState();
    const locA = getBlitOffsetShader(stateA);
    const locB = getBlitOffsetShader(stateB);
    expect(locA).not.toBe(locB);
  });
});

describe('getBlitShader', () => {
  it('compiles on first call', () => {
    const { state, gl } = makeWebGLState();
    const loc = getBlitShader(state);
    expect(loc.program).toBeDefined();
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
  });

  it('returns the cached shader on repeated calls', () => {
    const { state } = makeWebGLState();
    const loc1 = getBlitShader(state);
    const loc2 = getBlitShader(state);
    expect(loc1).toBe(loc2);
  });
});

describe('getTintShader', () => {
  it('compiles on first call', () => {
    const { state, gl } = makeWebGLState();
    const loc = getTintShader(state);
    expect(loc.program).toBeDefined();
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
  });

  it('returns the cached shader on repeated calls', () => {
    const { state } = makeWebGLState();
    const loc1 = getTintShader(state);
    const loc2 = getTintShader(state);
    expect(loc1).toBe(loc2);
  });
});
