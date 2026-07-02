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
export function makeFakeGl2(options?: { compileOk?: boolean; linkOk?: boolean }): FakeGl2 {
  const compileOk = options?.compileOk ?? true;
  const linkOk = options?.linkOk ?? true;
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
    BLEND: 0x0be2,
    CULL_FACE: 0x0b44,
    BACK: 0x0405,
    DEPTH_TEST: 0x0b71,
    LESS: 0x0201,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    SRC_ALPHA: 0x0302,
    createShader: record('createShader', {}),
    shaderSource: record('shaderSource'),
    compileShader: record('compileShader'),
    getShaderParameter: record('getShaderParameter', compileOk),
    getShaderInfoLog: record('getShaderInfoLog', ''),
    deleteShader: record('deleteShader'),
    createProgram: record('createProgram', {}),
    attachShader: record('attachShader'),
    linkProgram: record('linkProgram'),
    getProgramParameter: record('getProgramParameter', linkOk),
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
    vertexAttribPointer: record('vertexAttribPointer'),
    vertexAttribIPointer: record('vertexAttribIPointer'),
    vertexAttrib4f: record('vertexAttrib4f'),
    blendFunc: record('blendFunc'),
    cullFace: record('cullFace'),
    depthFunc: record('depthFunc'),
    depthMask: record('depthMask'),
    disable: record('disable'),
    enable: record('enable'),
    drawElements: record('drawElements'),
    drawArrays: record('drawArrays'),
    activeTexture: record('activeTexture'),
    bindTexture: record('bindTexture'),
    createTexture: record('createTexture', {}),
    texParameteri: record('texParameteri'),
    texImage2D: record('texImage2D'),
    pixelStorei: record('pixelStorei'),
    uniform1i: record('uniform1i'),
    uniform1f: record('uniform1f'),
    uniform3f: record('uniform3f'),
    uniform4f: record('uniform4f'),
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
    currentTexture: null,
    renderTargetViewport: null,
    textureCache: new WeakMap<CanvasImageSource, WebGLTexture>(),
  } satisfies Partial<GlRenderStateRuntime>);
  state[EntityRuntimeKey] = runtime;

  return { state, gl: context };
}
