import { BlendMode } from '@flighthq/types';

import {
  applyGlBlendMode,
  bindGlTexture,
  createGlTexture,
  drawGlQuad,
  enableGlBlendModeSupport,
  isBlendModeSupported,
  registerDefaultGlBlendModes,
  registerGlBlendMode,
  setGlQuadMatrixFromOffset,
  updateGlTexture,
  useGlProgram,
} from './glDraw';
import { getGlRenderStateRuntime } from './glRenderState';
import { registerGlBitmapShader } from './glShaderRegistry';
import { createGlState } from './glTestHelper';

describe('applyGlBlendMode', () => {
  it('does not call blendFunc when blend mode has not changed', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    getGlRenderStateRuntime(state).currentBlendMode = BlendMode.Normal;
    applyGlBlendMode(state, BlendMode.Normal);
    expect(gl.blendFunc).not.toHaveBeenCalled();
  });

  it('sets normal blend (ONE, ONE_MINUS_SRC_ALPHA) for BlendMode.Normal', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Normal);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('sets additive blend (ONE, ONE) for BlendMode.Add', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Add);
    const g = gl as unknown as { ONE: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE);
  });

  it('sets (DST_COLOR, ONE_MINUS_SRC_ALPHA) for BlendMode.Multiply', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Multiply);
    const g = gl as unknown as { DST_COLOR: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.DST_COLOR, g.ONE_MINUS_SRC_ALPHA);
  });

  it('sets (ONE, ZERO) for BlendMode.None', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.None);
    const g = gl as unknown as { ONE: number; ZERO: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ZERO);
  });

  it('sets (ONE, ONE_MINUS_SRC_COLOR) for BlendMode.Screen', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Screen);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_COLOR: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_COLOR);
  });

  it('sets the MIN blend equation with (ONE, ONE) for BlendMode.Darken', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Darken);
    const g = gl as unknown as { ONE: number; MIN: number };
    expect(gl.blendEquation).toHaveBeenCalledWith(g.MIN);
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE);
  });

  it('sets the MAX blend equation with (ONE, ONE) for BlendMode.Lighten', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Lighten);
    const g = gl as unknown as { ONE: number; MAX: number };
    expect(gl.blendEquation).toHaveBeenCalledWith(g.MAX);
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE);
  });

  it('sets the reverse-subtract equation with (ONE, ONE) for BlendMode.Subtract', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Subtract);
    const g = gl as unknown as { ONE: number; FUNC_REVERSE_SUBTRACT: number };
    expect(gl.blendEquation).toHaveBeenCalledWith(g.FUNC_REVERSE_SUBTRACT);
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE);
  });

  it('sets (ZERO, ONE_MINUS_SRC_ALPHA) for BlendMode.Erase', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Erase);
    const g = gl as unknown as { ZERO: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ZERO, g.ONE_MINUS_SRC_ALPHA);
  });

  it('resets the blend equation to FUNC_ADD for a mode that does not carry one', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Darken);
    applyGlBlendMode(state, BlendMode.Normal);
    const g = gl as unknown as { FUNC_ADD: number };
    expect(gl.blendEquation).toHaveBeenLastCalledWith(g.FUNC_ADD);
  });

  it('falls back to normal blend for a mode with no registered realization', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Overlay);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('falls back to normal blend when no modes are registered at all', () => {
    const { state, gl } = createGlState();
    applyGlBlendMode(state, BlendMode.Multiply);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('updates currentBlendMode after the change', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Add);
    expect(getGlRenderStateRuntime(state).currentBlendMode).toBe(BlendMode.Add);
  });

  it('calls blendFunc again when mode switches', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    applyGlBlendMode(state, BlendMode.Normal);
    applyGlBlendMode(state, BlendMode.Add);
    expect(gl.blendFunc).toHaveBeenCalledTimes(2);
  });
});

describe('bindGlTexture', () => {
  it('creates a new texture for an uncached image source', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img);
    expect(gl.createTexture).toHaveBeenCalled();
  });

  it('uploads texture data on first bind', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img);
    expect(gl.texImage2D).toHaveBeenCalled();
  });

  it('returns the same texture object on subsequent calls with the same source', () => {
    const { state } = createGlState();
    const img = document.createElement('img');
    const t1 = bindGlTexture(state, img);
    const t2 = bindGlTexture(state, img);
    expect(t1).toBe(t2);
  });

  it('does not call texImage2D again for a cached texture', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img);
    const uploadCount = (gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length;
    bindGlTexture(state, img);
    expect((gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length).toBe(uploadCount);
  });

  it('premultiplies alpha on upload for HTMLCanvasElement sources', () => {
    // Canvas pixels reach texImage2D as straight alpha; premultiplying on upload keeps canvas-backed
    // shapes/text consistent with the premultiplied (ONE, ONE_MINUS_SRC_ALPHA) blend. Without this a
    // semi-transparent shape blows out to full opacity.
    const { state, gl } = createGlState();
    const canvas = document.createElement('canvas');
    bindGlTexture(state, canvas);
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true,
    );
  });

  it('sets premultiply to true for non-canvas image sources', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    bindGlTexture(state, img);
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true,
    );
  });

  it('rebinds and updates currentTexture when switching to a cached texture', () => {
    const { state, gl } = createGlState();
    const img = document.createElement('img');
    const texture = bindGlTexture(state, img);
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentTexture = null;
    bindGlTexture(state, img);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
    expect(runtime.currentTexture).toBe(texture);
  });
});

describe('createGlTexture', () => {
  it('creates and returns a WebGLTexture', () => {
    const { state } = createGlState();
    const texture = createGlTexture(state);
    expect(texture).toBeDefined();
  });

  it('binds the new texture', () => {
    const { state, gl } = createGlState();
    const texture = createGlTexture(state);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
  });

  it('sets CLAMP_TO_EDGE for both wrap modes', () => {
    const { state, gl } = createGlState();
    createGlTexture(state);
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_WRAP_S: number;
      TEXTURE_WRAP_T: number;
      CLAMP_TO_EDGE: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  });

  it('uses LINEAR filter when allowSmoothing is true', () => {
    const { state, gl } = createGlState({ allowSmoothing: true });
    createGlTexture(state);
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_MIN_FILTER: number;
      TEXTURE_MAG_FILTER: number;
      LINEAR: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  });

  it('uses NEAREST filter when allowSmoothing is false', () => {
    const { state, gl } = createGlState({ allowSmoothing: false });
    createGlTexture(state);
    const g = gl as unknown as {
      TEXTURE_2D: number;
      TEXTURE_MIN_FILTER: number;
      TEXTURE_MAG_FILTER: number;
      NEAREST: number;
    };
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    expect(gl.texParameteri).toHaveBeenCalledWith(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
  });

  it('stores the new texture as currentTexture on state', () => {
    const { state } = createGlState();
    const texture = createGlTexture(state);
    expect(getGlRenderStateRuntime(state).currentTexture).toBe(texture);
  });
});

describe('drawGlQuad', () => {
  it('writes vertex positions and UVs into quadVertexData', () => {
    const { state } = createGlState();
    drawGlQuad(state, 0, 0, 100, 50, 0, 0, 1, 1);
    const v = getGlRenderStateRuntime(state).quadVertexData;
    // Bottom-left
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(0);
    expect(v[2]).toBe(0);
    expect(v[3]).toBe(0);
    // Bottom-right
    expect(v[4]).toBe(100);
    expect(v[5]).toBe(0);
    expect(v[6]).toBe(1);
    expect(v[7]).toBe(0);
    // Top-right
    expect(v[8]).toBe(100);
    expect(v[9]).toBe(50);
    expect(v[10]).toBe(1);
    expect(v[11]).toBe(1);
    // Top-left
    expect(v[12]).toBe(0);
    expect(v[13]).toBe(50);
    expect(v[14]).toBe(0);
    expect(v[15]).toBe(1);
  });

  it('calls bufferSubData to upload vertex data', () => {
    const { state, gl } = createGlState();
    drawGlQuad(state, 10, 20, 110, 70, 0.1, 0.2, 0.9, 0.8);
    expect(gl.bufferSubData).toHaveBeenCalledWith(
      (gl as unknown as { ARRAY_BUFFER: number }).ARRAY_BUFFER,
      0,
      getGlRenderStateRuntime(state).quadVertexData,
    );
  });

  it('calls drawElements for 6 indices forming 2 triangles', () => {
    const { state, gl } = createGlState();
    drawGlQuad(state, 0, 0, 100, 50, 0, 0, 1, 1);
    const g = gl as unknown as { TRIANGLES: number; UNSIGNED_SHORT: number };
    expect(gl.drawElements).toHaveBeenCalledWith(g.TRIANGLES, 6, g.UNSIGNED_SHORT, 0);
  });
});

describe('enableGlBlendModeSupport', () => {
  it('wires applyBlendMode onto the state', () => {
    const { state } = createGlState();
    expect(state.applyBlendMode).toBeNull();
    enableGlBlendModeSupport(state);
    expect(state.applyBlendMode).not.toBeNull();
  });

  it('causes blend modes to be applied via gl.blendFunc', () => {
    const { state, gl } = createGlState();
    enableGlBlendModeSupport(state);
    state.applyBlendMode!(state, BlendMode.Add);
    expect(gl.blendFunc).toHaveBeenCalled();
  });

  it('registers the default blend modes', () => {
    const { state } = createGlState();
    enableGlBlendModeSupport(state);
    expect(isBlendModeSupported(state, BlendMode.Multiply)).toBe(true);
  });
});

describe('isBlendModeSupported', () => {
  it('returns false when no modes are registered', () => {
    const { state } = createGlState();
    expect(isBlendModeSupported(state, BlendMode.Normal)).toBe(false);
  });

  it('returns true for a registered built-in mode', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    expect(isBlendModeSupported(state, BlendMode.Screen)).toBe(true);
  });

  it('returns false for a built-in with no fixed-function realization', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    expect(isBlendModeSupported(state, BlendMode.Overlay)).toBe(false);
  });

  it('returns true for a custom registered mode', () => {
    const { state } = createGlState();
    registerGlBlendMode(state, 'acme.Foo', { src: 'ONE', dst: 'ZERO' });
    expect(isBlendModeSupported(state, 'acme.Foo')).toBe(true);
  });
});

describe('registerDefaultGlBlendModes', () => {
  it('registers the tier-1 fixed-function modes', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    for (const mode of [
      BlendMode.Normal,
      BlendMode.Layer,
      BlendMode.Add,
      BlendMode.Multiply,
      BlendMode.Screen,
      BlendMode.Darken,
      BlendMode.Lighten,
      BlendMode.Subtract,
      BlendMode.Erase,
    ]) {
      expect(isBlendModeSupported(state, mode)).toBe(true);
    }
  });

  it('does not register the shader-only modes', () => {
    const { state } = createGlState();
    registerDefaultGlBlendModes(state);
    for (const mode of [BlendMode.Overlay, BlendMode.HardLight, BlendMode.Difference, BlendMode.Invert]) {
      expect(isBlendModeSupported(state, mode)).toBe(false);
    }
  });
});

describe('registerGlBlendMode', () => {
  it('makes a custom mode applied through gl.blendFunc', () => {
    const { state, gl } = createGlState();
    registerGlBlendMode(state, 'acme.Foo', { src: 'DST_COLOR', dst: 'ZERO' });
    applyGlBlendMode(state, 'acme.Foo');
    const g = gl as unknown as { DST_COLOR: number; ZERO: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.DST_COLOR, g.ZERO);
  });

  it('overrides a built-in mode last-write-wins', () => {
    const { state, gl } = createGlState();
    registerDefaultGlBlendModes(state);
    registerGlBlendMode(state, BlendMode.Add, { src: 'ZERO', dst: 'ONE' });
    applyGlBlendMode(state, BlendMode.Add);
    const g = gl as unknown as { ONE: number; ZERO: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ZERO, g.ONE);
  });
});

describe('setGlQuadMatrixFromOffset', () => {
  it('bakes the offset into the translation before setting the matrix', () => {
    const { state, gl } = createGlState();
    // Identity transform + offset (dx=10, dy=20): effective tx = 0 + 1*10 + 0*20 = 10
    const runtime = getGlRenderStateRuntime(state);
    setGlQuadMatrixFromOffset(state, 1, 0, 0, 1, 0, 0, 10, 20);
    expect(gl.uniformMatrix3fv).toHaveBeenCalledWith(runtime.shaderLoc.locMatrix, false, runtime.matrixArray);
    // tx * 2/200 - 1 = 10 * 0.01 - 1 = -0.9
    expect(runtime.matrixArray[6]).toBeCloseTo(-0.9);
    // -ty * 2/100 + 1 = -20 * 0.02 + 1 = 0.6
    expect(runtime.matrixArray[7]).toBeCloseTo(0.6);
  });

  it('applies the offset through the transform matrix components', () => {
    const { state } = createGlState();
    // Scale-2 transform with offset (dx=5, dy=0): effective tx = 0 + 2*5 + 0*0 = 10
    setGlQuadMatrixFromOffset(state, 2, 0, 0, 2, 0, 0, 5, 0);
    // tx * 2/200 - 1 = 10 * 0.01 - 1 = -0.9
    expect(getGlRenderStateRuntime(state).matrixArray[6]).toBeCloseTo(-0.9);
  });
});

describe('updateGlTexture', () => {
  it('binds the texture when it is not the current one', () => {
    const { state, gl } = createGlState();
    const texture = {} as WebGLTexture;
    const canvas = document.createElement('canvas');
    getGlRenderStateRuntime(state).currentTexture = null;
    updateGlTexture(state, texture, canvas);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
  });

  it('updates currentTexture after binding', () => {
    const { state } = createGlState();
    const texture = {} as WebGLTexture;
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentTexture = null;
    updateGlTexture(state, {} as WebGLTexture, document.createElement('canvas'));
    updateGlTexture(state, texture, document.createElement('canvas'));
    // The last call should have updated currentTexture
    expect(runtime.currentTexture).toBe(texture);
  });

  it('skips bindTexture when texture is already current', () => {
    const { state, gl } = createGlState();
    const texture = {} as WebGLTexture;
    getGlRenderStateRuntime(state).currentTexture = texture;
    updateGlTexture(state, texture, document.createElement('canvas'));
    expect(gl.bindTexture).not.toHaveBeenCalled();
  });

  it('always calls texImage2D to upload canvas data', () => {
    const { state, gl } = createGlState();
    const texture = {} as WebGLTexture;
    getGlRenderStateRuntime(state).currentTexture = texture;
    updateGlTexture(state, texture, document.createElement('canvas'));
    expect(gl.texImage2D).toHaveBeenCalled();
  });

  it('sets premultiply alpha before uploading', () => {
    const { state, gl } = createGlState();
    const texture = {} as WebGLTexture;
    getGlRenderStateRuntime(state).currentTexture = texture;
    updateGlTexture(state, texture, document.createElement('canvas'));
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true,
    );
  });
});

describe('useGlProgram', () => {
  it('calls useProgram when no program is active', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentProgram = null;
    useGlProgram(state);
    expect(gl.useProgram).toHaveBeenCalledWith(runtime.shaderLoc.program);
  });

  it('does not call useProgram when program is already active', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentProgram = runtime.shaderLoc.program;
    useGlProgram(state);
    expect(gl.useProgram).not.toHaveBeenCalled();
  });

  it('stores the program as currentProgram after activation', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentProgram = null;
    useGlProgram(state);
    expect(runtime.currentProgram).toBe(runtime.shaderLoc.program);
  });

  it('uses the registered bitmap shader program and locations', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const shader = {
      bind: vi.fn(),
      locations: { ...runtime.shaderLoc, program: {} as WebGLProgram },
      program: {} as WebGLProgram,
    };
    shader.locations.program = shader.program;

    registerGlBitmapShader(state, shader);
    useGlProgram(state);

    expect(gl.useProgram).toHaveBeenCalledWith(shader.program);
    expect(runtime.shaderLoc).toBe(shader.locations);
    expect(runtime.currentProgram).toBe(shader.program);
  });
});
