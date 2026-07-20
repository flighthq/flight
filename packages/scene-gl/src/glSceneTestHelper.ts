import { createRenderState } from '@flighthq/render';
import { createGlRenderStateRuntime } from '@flighthq/render-gl';
import type { GlRenderState, GlRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

// A minimal fake WebGL2 context for scene-gl unit tests. vitest-webgl-canvas-mock only mocks the
// WebGL1 contexts, so 3D tests that exercise the program cache / upload / draw path drive this
// hand-rolled stub instead (per the repo's WebGL2 testing note). It records every call so a test can
// assert the GL it drove, and returns plausible objects for the create*/getUniformLocation/get*
// queries the renderer makes. It is not a renderer — it does not produce pixels — but it lets the
// CPU-side bind/draw/cache logic run to completion under jsdom.
export interface FakeGl2 extends WebGL2RenderingContext {
  calls: { name: string; args: unknown[] }[];
}

// Builds a fresh fake WebGL2 context. compileOk/linkOk control the COMPILE_STATUS/LINK_STATUS the
// stub reports, so a test can assert the program-cache throws on a shader failure.
export function makeFakeGl2(options?: {
  activeUniforms?: readonly { name: string; type: number }[];
  compileOk?: boolean;
  linkOk?: boolean;
}): FakeGl2 {
  const compileOk = options?.compileOk ?? true;
  const linkOk = options?.linkOk ?? true;
  const activeUniforms = options?.activeUniforms ?? [];
  const calls: { name: string; args: unknown[] }[] = [];

  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]): unknown => {
      calls.push({ name, args });
      return result;
    };

  const gl = {
    calls,
    // GL enum constants the renderer reads.
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    TRIANGLES: 0x0004,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE_2D: 0x0de1,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ACTIVE_UNIFORMS: 0x8b86,
    FLOAT_VEC2: 0x8b50,
    FLOAT_VEC3: 0x8b51,
    FLOAT_VEC4: 0x8b52,
    FLOAT_MAT2: 0x8b5a,
    FLOAT_MAT3: 0x8b5b,
    FLOAT_MAT4: 0x8b5c,
    BLEND: 0x0be2,
    CULL_FACE: 0x0b44,
    BACK: 0x0405,
    DEPTH_TEST: 0x0b71,
    LESS: 0x0201,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    SRC_ALPHA: 0x0302,
    FUNC_ADD: 0x8006,
    FRAMEBUFFER: 0x8d40,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    COLOR: 0x1800,
    DEPTH_STENCIL: 0x84f9,
    MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb,
    RGBA32F: 0x8814,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    getParameter: (pname: number) => (pname === 0x8dfb ? 1024 : 0),
    createShader: record('createShader', {}),
    shaderSource: record('shaderSource'),
    compileShader: record('compileShader'),
    getShaderParameter: record('getShaderParameter', compileOk),
    getShaderInfoLog: record('getShaderInfoLog', ''),
    deleteShader: record('deleteShader'),
    createProgram: record('createProgram', {}),
    attachShader: record('attachShader'),
    linkProgram: record('linkProgram'),
    getProgramParameter: (_program: unknown, pname: number) => {
      calls.push({ name: 'getProgramParameter', args: [pname] });
      return pname === 0x8b86 ? activeUniforms.length : linkOk;
    },
    getActiveUniform: (_program: unknown, index: number) => {
      calls.push({ name: 'getActiveUniform', args: [index] });
      const info = activeUniforms[index];
      return info === undefined ? null : { name: info.name, size: 1, type: info.type };
    },
    getProgramInfoLog: record('getProgramInfoLog', ''),
    useProgram: record('useProgram'),
    getUniformLocation: (_program: unknown, name: string) => {
      calls.push({ name: 'getUniformLocation', args: [name] });
      return { name };
    },
    createBuffer: record('createBuffer', {}),
    bindBuffer: record('bindBuffer'),
    bufferData: record('bufferData'),
    createVertexArray: record('createVertexArray', {}),
    bindVertexArray: record('bindVertexArray'),
    deleteBuffer: record('deleteBuffer'),
    deleteFramebuffer: record('deleteFramebuffer'),
    deleteProgram: record('deleteProgram'),
    deleteRenderbuffer: record('deleteRenderbuffer'),
    deleteTexture: record('deleteTexture'),
    deleteVertexArray: record('deleteVertexArray'),
    enableVertexAttribArray: record('enableVertexAttribArray'),
    getAttribLocation: record('getAttribLocation', 0),
    vertexAttribPointer: record('vertexAttribPointer'),
    vertexAttribIPointer: record('vertexAttribIPointer'),
    vertexAttrib4f: record('vertexAttrib4f'),
    vertexAttribDivisor: record('vertexAttribDivisor'),
    bufferSubData: record('bufferSubData'),
    bindFramebuffer: record('bindFramebuffer'),
    blendEquation: record('blendEquation'),
    blendFunc: record('blendFunc'),
    clear: record('clear'),
    clearColor: record('clearColor'),
    clearDepth: record('clearDepth'),
    clearBufferfv: record('clearBufferfv'),
    clearBufferfi: record('clearBufferfi'),
    cullFace: record('cullFace'),
    depthFunc: record('depthFunc'),
    depthMask: record('depthMask'),
    flush: record('flush'),
    viewport: record('viewport'),
    disable: record('disable'),
    enable: record('enable'),
    drawElements: record('drawElements'),
    drawElementsInstanced: record('drawElementsInstanced'),
    drawArrays: record('drawArrays'),
    activeTexture: record('activeTexture'),
    bindTexture: record('bindTexture'),
    createTexture: record('createTexture', {}),
    texParameteri: record('texParameteri'),
    texImage2D: record('texImage2D'),
    texSubImage2D: record('texSubImage2D'),
    pixelStorei: record('pixelStorei'),
    uniform1i: record('uniform1i'),
    uniform1f: record('uniform1f'),
    uniform1fv: record('uniform1fv'),
    uniform2f: record('uniform2f'),
    uniform2fv: record('uniform2fv'),
    uniform3f: record('uniform3f'),
    uniform3fv: record('uniform3fv'),
    uniform4f: record('uniform4f'),
    uniform4fv: record('uniform4fv'),
    uniformMatrix3fv: record('uniformMatrix3fv'),
    uniformMatrix4fv: record('uniformMatrix4fv'),
  } as unknown as FakeGl2;

  return gl;
}

// A GlRenderState backed by the fake WebGL2 context, with the render-gl runtime attached (so
// bindGlTexture's textureCache exists). scene-gl's own per-state runtime is created lazily on first
// getGlSceneRuntime, exactly as in production.
export function makeGlSceneState(gl?: FakeGl2): { state: GlRenderState; gl: FakeGl2 } {
  const context = gl ?? makeFakeGl2();
  const canvas = { width: 256, height: 256 } as HTMLCanvasElement;
  const state = createRenderState({
    allowSmoothing: true,
    backgroundColorRgba: [0, 0, 0, 0],
  }) as GlRenderState;

  Object.assign(state, { canvas, gl: context, applyBlendMode: null });

  const runtime = createGlRenderStateRuntime();
  Object.assign(runtime, {
    currentBlendMode: null,
    currentFramebuffer: null,
    currentProgram: null,
    currentTexture: null,
    renderTargetViewport: null,
    textureCache: new WeakMap<CanvasImageSource, WebGLTexture>(),
    imageResourceTextureCache: new WeakMap(),
    // Fullscreen-pass scratch, so tests can drive present/resolve passes (drawGlFullscreenPass) that
    // read the quad buffers and the default-shader slot alongside the mesh path.
    quadVertexBuffer: {} as WebGLBuffer,
    quadIndexBuffer: {} as WebGLBuffer,
    quadVertexData: new Float32Array(16),
    defaultBitmapShader: { locations: {}, program: {}, bind: () => {} },
  } as unknown as Partial<GlRenderStateRuntime>);
  state[EntityRuntimeKey] = runtime;

  return { state, gl: context };
}
