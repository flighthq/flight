import { createRenderState } from '@flighthq/render/contract';
import type { GlRenderState, GlRenderStateRuntime } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { GlShaderLocations } from '@flighthq/types/contract';

import { createGlContextState, createGlRenderStateRuntime } from './glRenderState';

export function createGlState(options?: { allowSmoothing?: boolean; backgroundColorRgba?: number[] }): {
  state: GlRenderState;
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  shaderLoc: GlShaderLocations;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const gl = makeGL();
  const shaderLoc = makeShaderLoc();
  const state = createRenderState({
    allowSmoothing: options?.allowSmoothing ?? true,
    backgroundColorRgba: options?.backgroundColorRgba ?? [0, 0, 0, 0],
  }) as GlRenderState;

  // Entity fields live directly on the state.
  Object.assign(state, {
    gl,
    applyBlendMode: null,
  });

  // Runtime (package-private GPU) fields live on the runtime object stored under EntityRuntimeKey,
  // mirroring what createGlRenderState does in production.
  const runtime = createGlRenderStateRuntime(createGlContextState(gl));
  Object.assign(runtime, {
    currentBlendSignature: null,
    currentFramebuffer: null,
    currentMaskDepth: 0,
    currentShader: { locations: shaderLoc, program: shaderLoc.program },
    currentScissorRect: null,
    currentTextureRealization: null,
    flushPendingDraws: null,
    renderTargetViewport: null,
    textureCache: new WeakMap<CanvasImageSource, WebGLTexture>(),
    textureSourcePremultipliedTextureCache: new WeakMap(),
    textureSourcePremultipliedSrgbTextureCache: new WeakMap(),
    textureSourceStraightTextureCache: new WeakMap(),
    textureSourceStraightSrgbTextureCache: new WeakMap(),
    defaultBitmapShader: { locations: shaderLoc, program: shaderLoc.program, bind: vi.fn() },
    quadVertexBuffer: {} as WebGLBuffer,
    quadIndexBuffer: {} as WebGLBuffer,
    quadVertexData: new Float32Array(16),
    matrixArray: new Float32Array(9),
    scissorStack: [],
    clipForms: [],
    quadBatchWriterBlendMode: null,
    quadBatchWriterCount: 0,
    quadBatchWriterInstanceBuffer: null,
    quadBatchWriterInstanceData: new Float32Array(13 * 256),
    quadBatchWriterTexture: null,
    quadBatchWriterSampler: null,
    quadBatchWriterStraightAlpha: false,
    quadBatchWriterSmoothing: null,
  } satisfies Partial<GlRenderStateRuntime>);
  state[EntityRuntimeKey] = runtime;

  return { state, gl, canvas, shaderLoc };
}

// makeGL returns a fresh isolated mock for unit tests that call GL functions
// directly (e.g. shader math tests) and need a clean call-count slate.
// Relies on the jsdom webgl2Mock setup file patching HTMLCanvasElement.getContext.
export function makeGL(width = 200, height = 100): WebGL2RenderingContext {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
  Object.defineProperties(gl, {
    drawingBufferHeight: { configurable: true, value: height },
    drawingBufferWidth: { configurable: true, value: width },
  });
  return gl;
}

export function makeShaderLoc(): GlShaderLocations {
  return {
    program: {} as WebGLProgram,
    locPosition: 0,
    locTexCoord: 1,
    locMatrix: {} as WebGLUniformLocation,
    locAlpha: {} as WebGLUniformLocation,
    locColorScale: {} as WebGLUniformLocation,
    locColorBias: {} as WebGLUniformLocation,
    locHasColorScaleBias: {} as WebGLUniformLocation,
    locTexture: {} as WebGLUniformLocation,
  };
}
