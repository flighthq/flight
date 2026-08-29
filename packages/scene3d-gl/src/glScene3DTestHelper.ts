import { createGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createRenderState } from '@flighthq/render/contract';
import type { GlContext, GlRenderState, GlRenderStateRuntime } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

// A minimal fake WebGL2 context for scene-gl unit tests. vitest-webgl-canvas-mock only mocks the
// WebGL1 contexts, so 3D tests that exercise the program cache / upload / draw path drive this
// hand-rolled stub instead (per the repo's WebGL2 testing note). It records every call so a test can
// assert the GL it drove, and returns plausible objects for the create*/getUniformLocation/get*
// queries the renderer makes. It is not a renderer — it does not produce pixels — but it lets the
// CPU-side bind/draw/cache logic run to completion under jsdom.
export interface FakeGl2
  extends
    GlContext,
    Pick<
      WebGL2RenderingContext,
      | 'drawArraysInstanced'
      | 'getError'
      | 'INVALID_ENUM'
      | 'INVALID_OPERATION'
      | 'INVALID_VALUE'
      | 'NO_ERROR'
      | 'SRC_ALPHA'
    > {
  calls: { name: string; args: unknown[] }[];
}

interface FakeGlErrorAuditState {
  takePendingAuditMessage(): string | null;
}

const GL_ERROR_AUDIT_REGISTER_KEY = '__flightRegisterFakeGlErrorAuditState';
const GL_NO_ERROR = 0;
const GL_INVALID_ENUM = 0x0500;
const GL_INVALID_VALUE = 0x0501;
const GL_INVALID_OPERATION = 0x0502;
const GL_UNSIGNED_BYTE = 0x1401;
const GL_UNSIGNED_SHORT = 0x1403;
const GL_UNSIGNED_INT = 0x1405;
const GL_PRIMITIVE_MODES = new Set([0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006]);

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
  const errorState = createFakeGlErrorState('scene3d WebGL2 fake');
  // GL starts with every capability disabled except DITHER; tests seed what they need via gl.enable.
  const enabledCapabilities = new Set<number>();

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
    UNSIGNED_BYTE: GL_UNSIGNED_BYTE,
    UNSIGNED_SHORT: GL_UNSIGNED_SHORT,
    UNSIGNED_INT: GL_UNSIGNED_INT,
    LINES: 0x0001,
    LINE_STRIP: 0x0003,
    POINTS: 0x0000,
    TRIANGLES: 0x0004,
    TRIANGLE_STRIP: 0x0005,
    TRIANGLE_FAN: 0x0006,
    LINE_LOOP: 0x0002,
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
    CCW: 0x0901,
    CULL_FACE: 0x0b44,
    CW: 0x0900,
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
    NO_ERROR: GL_NO_ERROR,
    INVALID_ENUM: GL_INVALID_ENUM,
    INVALID_VALUE: GL_INVALID_VALUE,
    INVALID_OPERATION: GL_INVALID_OPERATION,
    MAX_TEXTURE_IMAGE_UNITS: 0x8872,
    MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb,
    RGBA32F: 0x8814,
    RGBA: 0x1908,
    SRGB8_ALPHA8: 0x8c43,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    getParameter: (pname: number) => (pname === 0x8dfb ? 1024 : pname === 0x8872 ? 16 : 0),
    getError: (): number => errorState.getError(),
    getExtension: record('getExtension', null),
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
    frontFace: record('frontFace'),
    depthFunc: record('depthFunc'),
    depthMask: record('depthMask'),
    flush: record('flush'),
    viewport: record('viewport'),
    disable: (capability: number): void => {
      calls.push({ name: 'disable', args: [capability] });
      enabledCapabilities.delete(capability);
    },
    enable: (capability: number): void => {
      calls.push({ name: 'enable', args: [capability] });
      enabledCapabilities.add(capability);
    },
    // Tracked rather than recorded, because code that saves a capability bit and restores it reads the
    // bit back: a stub returning undefined makes every restore look like a no-op and hides the leak.
    isEnabled: (capability: number): boolean => enabledCapabilities.has(capability),
    drawElements: (mode: number, count: number, type: number, offset: number): void => {
      const args = [mode, count, type, offset];
      if (validateFakeGlDrawElements(errorState, 'drawElements', mode, count, type, offset)) {
        calls.push({ name: 'drawElements', args });
      }
    },
    drawElementsInstanced: (mode: number, count: number, type: number, offset: number, instanceCount: number): void => {
      const args = [mode, count, type, offset, instanceCount];
      if (validateFakeGlDrawElements(errorState, 'drawElementsInstanced', mode, count, type, offset, instanceCount)) {
        calls.push({ name: 'drawElementsInstanced', args });
      }
    },
    drawArrays: (mode: number, first: number, count: number): void => {
      const args = [mode, first, count];
      if (validateFakeGlDrawArrays(errorState, 'drawArrays', mode, first, count)) {
        calls.push({ name: 'drawArrays', args });
      }
    },
    drawArraysInstanced: (mode: number, first: number, count: number, instanceCount: number): void => {
      const args = [mode, first, count, instanceCount];
      if (validateFakeGlDrawArrays(errorState, 'drawArraysInstanced', mode, first, count, instanceCount)) {
        calls.push({ name: 'drawArraysInstanced', args });
      }
    },
    // Deliberately record-only: Flight has no production drawRangeElements call to validate today.
    drawRangeElements: record('drawRangeElements'),
    activeTexture: record('activeTexture'),
    bindTexture: record('bindTexture'),
    createTexture: record('createTexture', {}),
    texParameteri: record('texParameteri'),
    generateMipmap: record('generateMipmap'),
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

function createFakeGlErrorState(label: string): {
  getError(): number;
  setError(code: number, call: string, args: readonly unknown[]): void;
  takePendingAuditMessage(): string | null;
} {
  let pendingError = GL_NO_ERROR;
  let pendingMessage: string | null = null;
  const state = {
    getError(): number {
      const result = pendingError;
      pendingError = GL_NO_ERROR;
      pendingMessage = null;
      return result;
    },
    setError(code: number, call: string, args: readonly unknown[]): void {
      if (pendingError !== GL_NO_ERROR) return;
      pendingError = code;
      pendingMessage = `${label}: ${getGlErrorName(code)} from ${call}(${args.join(', ')})`;
    },
    takePendingAuditMessage(): string | null {
      const result = pendingMessage;
      pendingError = GL_NO_ERROR;
      pendingMessage = null;
      return result;
    },
  };
  const register = (globalThis as Record<string, unknown>)[GL_ERROR_AUDIT_REGISTER_KEY] as
    | ((auditState: FakeGlErrorAuditState) => void)
    | undefined;
  register?.(state);
  return state;
}

function getGlErrorName(error: number): string {
  if (error === GL_INVALID_ENUM) return 'INVALID_ENUM';
  if (error === GL_INVALID_VALUE) return 'INVALID_VALUE';
  return 'INVALID_OPERATION';
}

function validateFakeGlDrawArrays(
  errorState: ReturnType<typeof createFakeGlErrorState>,
  call: string,
  mode: number,
  first: number,
  count: number,
  instanceCount?: number,
): boolean {
  const args = instanceCount === undefined ? [mode, first, count] : [mode, first, count, instanceCount];
  if (!GL_PRIMITIVE_MODES.has(mode)) {
    errorState.setError(GL_INVALID_ENUM, call, args);
    return false;
  }
  if (first < 0 || count < 0 || (instanceCount !== undefined && instanceCount < 0)) {
    errorState.setError(GL_INVALID_VALUE, call, args);
    return false;
  }
  return true;
}

function validateFakeGlDrawElements(
  errorState: ReturnType<typeof createFakeGlErrorState>,
  call: string,
  mode: number,
  count: number,
  type: number,
  offset: number,
  instanceCount?: number,
): boolean {
  const args = instanceCount === undefined ? [mode, count, type, offset] : [mode, count, type, offset, instanceCount];
  if (!GL_PRIMITIVE_MODES.has(mode)) {
    errorState.setError(GL_INVALID_ENUM, call, args);
    return false;
  }
  const typeSize = type === GL_UNSIGNED_BYTE ? 1 : type === GL_UNSIGNED_SHORT ? 2 : type === GL_UNSIGNED_INT ? 4 : 0;
  if (typeSize === 0) {
    errorState.setError(GL_INVALID_ENUM, call, args);
    return false;
  }
  if (count < 0 || offset < 0 || (instanceCount !== undefined && instanceCount < 0)) {
    errorState.setError(GL_INVALID_VALUE, call, args);
    return false;
  }
  if (offset % typeSize !== 0) {
    errorState.setError(GL_INVALID_OPERATION, call, args);
    return false;
  }
  return true;
}

// A GlRenderState backed by the fake WebGL2 context, with the render-gl runtime attached (so
// bindGlTexture's textureCache exists). scene-gl's own per-state runtime is created lazily on first
// getGlScene3DRuntime, exactly as in production.
export function makeGlScene3DState(gl?: FakeGl2): { state: GlRenderState; gl: FakeGl2 } {
  const context = gl ?? makeFakeGl2();
  const canvas = { width: 256, height: 256 } as HTMLCanvasElement;
  const state = createRenderState({
    allowSmoothing: true,
    backgroundColorRgba: [0, 0, 0, 0],
  }) as GlRenderState;

  Object.assign(state, { canvas, gl: context, applyBlendMode: null });

  const runtime = createGlRenderStateRuntime();
  Object.assign(runtime, {
    currentBlendSignature: null,
    currentFramebuffer: null,
    currentShader: null,
    currentTextureRealization: null,
    renderTargetViewport: null,
    textureCache: new WeakMap<CanvasImageSource, WebGLTexture>(),
    textureSourcePremultipliedTextureCache: new WeakMap(),
    textureSourcePremultipliedSrgbTextureCache: new WeakMap(),
    textureSourceStraightTextureCache: new WeakMap(),
    textureSourceStraightSrgbTextureCache: new WeakMap(),
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
