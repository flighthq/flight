import {
  bindWebGLTexture,
  createWebGLTexture,
  drawWebGLQuad,
  setQuadMatrixFromOffset,
  setWebGLBlendMode,
  updateWebGLTexture,
  useWebGLProgram,
} from './webglDraw';
import { registerWebGLBitmapShader } from './webglShaderRegistry';
import { makeWebGLState } from './webglTestHelper';

describe('bindWebGLTexture', () => {
  it('creates a new texture for an uncached image source', () => {
    const { state, gl } = makeWebGLState();
    const img = document.createElement('img');
    bindWebGLTexture(state, img);
    expect(gl.createTexture).toHaveBeenCalled();
  });

  it('uploads texture data on first bind', () => {
    const { state, gl } = makeWebGLState();
    const img = document.createElement('img');
    bindWebGLTexture(state, img);
    expect(gl.texImage2D).toHaveBeenCalled();
  });

  it('returns the same texture object on subsequent calls with the same source', () => {
    const { state } = makeWebGLState();
    const img = document.createElement('img');
    const t1 = bindWebGLTexture(state, img);
    const t2 = bindWebGLTexture(state, img);
    expect(t1).toBe(t2);
  });

  it('does not call texImage2D again for a cached texture', () => {
    const { state, gl } = makeWebGLState();
    const img = document.createElement('img');
    bindWebGLTexture(state, img);
    const uploadCount = (gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length;
    bindWebGLTexture(state, img);
    expect((gl.texImage2D as ReturnType<typeof vi.fn>).mock.calls.length).toBe(uploadCount);
  });

  it('sets premultiply to false for HTMLCanvasElement sources', () => {
    const { state, gl } = makeWebGLState();
    const canvas = document.createElement('canvas');
    bindWebGLTexture(state, canvas);
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      false,
    );
  });

  it('sets premultiply to true for non-canvas image sources', () => {
    const { state, gl } = makeWebGLState();
    const img = document.createElement('img');
    bindWebGLTexture(state, img);
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true,
    );
  });

  it('rebinds and updates currentTexture when switching to a cached texture', () => {
    const { state, gl } = makeWebGLState();
    const img = document.createElement('img');
    const texture = bindWebGLTexture(state, img);
    state.currentTexture = null;
    bindWebGLTexture(state, img);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
    expect(state.currentTexture).toBe(texture);
  });
});

describe('createWebGLTexture', () => {
  it('creates and returns a WebGLTexture', () => {
    const { state } = makeWebGLState();
    const texture = createWebGLTexture(state);
    expect(texture).toBeDefined();
  });

  it('binds the new texture', () => {
    const { state, gl } = makeWebGLState();
    const texture = createWebGLTexture(state);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
  });

  it('sets CLAMP_TO_EDGE for both wrap modes', () => {
    const { state, gl } = makeWebGLState();
    createWebGLTexture(state);
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
    const { state, gl } = makeWebGLState({ allowSmoothing: true });
    createWebGLTexture(state);
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
    const { state, gl } = makeWebGLState({ allowSmoothing: false });
    createWebGLTexture(state);
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
    const { state } = makeWebGLState();
    const texture = createWebGLTexture(state);
    expect(state.currentTexture).toBe(texture);
  });
});

describe('drawWebGLQuad', () => {
  it('writes vertex positions and UVs into quadVertexData', () => {
    const { state } = makeWebGLState();
    drawWebGLQuad(state, 0, 0, 100, 50, 0, 0, 1, 1);
    const v = state.quadVertexData;
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
    const { state, gl } = makeWebGLState();
    drawWebGLQuad(state, 10, 20, 110, 70, 0.1, 0.2, 0.9, 0.8);
    expect(gl.bufferSubData).toHaveBeenCalledWith(
      (gl as unknown as { ARRAY_BUFFER: number }).ARRAY_BUFFER,
      0,
      state.quadVertexData,
    );
  });

  it('calls drawElements for 6 indices forming 2 triangles', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLQuad(state, 0, 0, 100, 50, 0, 0, 1, 1);
    const g = gl as unknown as { TRIANGLES: number; UNSIGNED_SHORT: number };
    expect(gl.drawElements).toHaveBeenCalledWith(g.TRIANGLES, 6, g.UNSIGNED_SHORT, 0);
  });
});

describe('setQuadMatrixFromOffset', () => {
  it('bakes the offset into the translation before setting the matrix', () => {
    const { state, gl } = makeWebGLState();
    // Identity transform + offset (dx=10, dy=20): effective tx = 0 + 1*10 + 0*20 = 10
    setQuadMatrixFromOffset(state, 1, 0, 0, 1, 0, 0, 10, 20);
    expect(gl.uniformMatrix3fv).toHaveBeenCalledWith(state.shaderLoc.locMatrix, false, state.matrixArray);
    // tx * 2/200 - 1 = 10 * 0.01 - 1 = -0.9
    expect(state.matrixArray[6]).toBeCloseTo(-0.9);
    // -ty * 2/100 + 1 = -20 * 0.02 + 1 = 0.6
    expect(state.matrixArray[7]).toBeCloseTo(0.6);
  });

  it('applies the offset through the transform matrix components', () => {
    const { state } = makeWebGLState();
    // Scale-2 transform with offset (dx=5, dy=0): effective tx = 0 + 2*5 + 0*0 = 10
    setQuadMatrixFromOffset(state, 2, 0, 0, 2, 0, 0, 5, 0);
    // tx * 2/200 - 1 = 10 * 0.01 - 1 = -0.9
    expect(state.matrixArray[6]).toBeCloseTo(-0.9);
  });
});

describe('setWebGLBlendMode', () => {
  it('does not call blendFunc when blend mode has not changed', () => {
    const { state, gl } = makeWebGLState();
    state.currentBlendMode = 0;
    setWebGLBlendMode(state, 0);
    expect(gl.blendFunc).not.toHaveBeenCalled();
  });

  it('sets normal blend (ONE, ONE_MINUS_SRC_ALPHA) for mode 0', () => {
    const { state, gl } = makeWebGLState();
    setWebGLBlendMode(state, 0);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('sets additive blend (ONE, ONE) for mode 1', () => {
    const { state, gl } = makeWebGLState();
    setWebGLBlendMode(state, 1);
    const g = gl as unknown as { ONE: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE);
  });

  it('updates currentBlendMode after the change', () => {
    const { state } = makeWebGLState();
    setWebGLBlendMode(state, 1);
    expect(state.currentBlendMode).toBe(1);
  });

  it('calls blendFunc again when mode switches', () => {
    const { state, gl } = makeWebGLState();
    setWebGLBlendMode(state, 0);
    setWebGLBlendMode(state, 1);
    expect(gl.blendFunc).toHaveBeenCalledTimes(2);
  });
});

describe('updateWebGLTexture', () => {
  it('binds the texture when it is not the current one', () => {
    const { state, gl } = makeWebGLState();
    const texture = {} as WebGLTexture;
    const canvas = document.createElement('canvas');
    state.currentTexture = null;
    updateWebGLTexture(state, texture, canvas);
    expect(gl.bindTexture).toHaveBeenCalledWith((gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D, texture);
  });

  it('updates currentTexture after binding', () => {
    const { state } = makeWebGLState();
    const texture = {} as WebGLTexture;
    state.currentTexture = null;
    updateWebGLTexture(state, {} as WebGLTexture, document.createElement('canvas'));
    updateWebGLTexture(state, texture, document.createElement('canvas'));
    // The last call should have updated currentTexture
    expect(state.currentTexture).toBe(texture);
  });

  it('skips bindTexture when texture is already current', () => {
    const { state, gl } = makeWebGLState();
    const texture = {} as WebGLTexture;
    state.currentTexture = texture;
    updateWebGLTexture(state, texture, document.createElement('canvas'));
    expect(gl.bindTexture).not.toHaveBeenCalled();
  });

  it('always calls texImage2D to upload canvas data', () => {
    const { state, gl } = makeWebGLState();
    const texture = {} as WebGLTexture;
    state.currentTexture = texture;
    updateWebGLTexture(state, texture, document.createElement('canvas'));
    expect(gl.texImage2D).toHaveBeenCalled();
  });

  it('sets premultiply alpha before uploading', () => {
    const { state, gl } = makeWebGLState();
    const texture = {} as WebGLTexture;
    state.currentTexture = texture;
    updateWebGLTexture(state, texture, document.createElement('canvas'));
    expect(gl.pixelStorei).toHaveBeenCalledWith(
      (gl as unknown as { UNPACK_PREMULTIPLY_ALPHA_WEBGL: number }).UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      true,
    );
  });
});

describe('useWebGLProgram', () => {
  it('calls useProgram when no program is active', () => {
    const { state, gl } = makeWebGLState();
    state.currentProgram = null;
    useWebGLProgram(state);
    expect(gl.useProgram).toHaveBeenCalledWith(state.shaderLoc.program);
  });

  it('does not call useProgram when program is already active', () => {
    const { state, gl } = makeWebGLState();
    state.currentProgram = state.shaderLoc.program;
    useWebGLProgram(state);
    expect(gl.useProgram).not.toHaveBeenCalled();
  });

  it('stores the program as currentProgram after activation', () => {
    const { state } = makeWebGLState();
    state.currentProgram = null;
    useWebGLProgram(state);
    expect(state.currentProgram).toBe(state.shaderLoc.program);
  });

  it('uses the registered bitmap shader program and locations', () => {
    const { state, gl } = makeWebGLState();
    const shader = {
      bind: vi.fn(),
      locations: { ...state.shaderLoc, program: {} as WebGLProgram },
      program: {} as WebGLProgram,
    };
    shader.locations.program = shader.program;

    registerWebGLBitmapShader(state, shader);
    useWebGLProgram(state);

    expect(gl.useProgram).toHaveBeenCalledWith(shader.program);
    expect(state.shaderLoc).toBe(shader.locations);
    expect(state.currentProgram).toBe(shader.program);
  });
});
