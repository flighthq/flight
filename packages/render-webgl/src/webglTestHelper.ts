import { createRenderState } from '@flighthq/render';
import type { WebGLRenderState, WebGLRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createWebGLRenderStateRuntime } from './webglRenderState';
import type { WebGLShaderLocations } from './webglShaderTypes';

// makeGL returns a fresh isolated mock for unit tests that call GL functions
// directly (e.g. shader math tests) and need a clean call-count slate.
// Relies on the jsdom webgl2Mock setup file patching HTMLCanvasElement.getContext.
export function makeGL(): WebGL2RenderingContext {
  const canvas = document.createElement('canvas');
  return canvas.getContext('webgl2') as WebGL2RenderingContext;
}

export function makeShaderLoc(): WebGLShaderLocations {
  return {
    program: {} as WebGLProgram,
    locPosition: 0,
    locTexCoord: 1,
    locMatrix: {} as WebGLUniformLocation,
    locAlpha: {} as WebGLUniformLocation,
    locColorMultiplier: {} as WebGLUniformLocation,
    locColorOffset: {} as WebGLUniformLocation,
    locHasColorTransform: {} as WebGLUniformLocation,
    locTexture: {} as WebGLUniformLocation,
  };
}

export function makeWebGLState(options?: { allowSmoothing?: boolean; backgroundColorRGBA?: number[] }): {
  state: WebGLRenderState;
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  shaderLoc: WebGLShaderLocations;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const gl = makeGL();
  const shaderLoc = makeShaderLoc();
  const state = createRenderState({
    allowSmoothing: options?.allowSmoothing ?? true,
    backgroundColorRGBA: options?.backgroundColorRGBA ?? [0, 0, 0, 0],
  }) as WebGLRenderState;

  // Entity fields live directly on the state.
  Object.assign(state, {
    canvas,
    gl,
    applyBlendMode: null,
  });

  // Runtime (package-private GPU) fields live on the runtime object stored under EntityRuntimeKey,
  // mirroring what createWebGLRenderState does in production.
  const runtime = createWebGLRenderStateRuntime();
  Object.assign(runtime, {
    currentBlendMode: null,
    currentFramebuffer: null,
    currentMaskDepth: 0,
    currentProgram: null,
    currentScissorRect: null,
    currentTexture: null,
    renderTargetViewport: null,
    textureCache: new WeakMap<CanvasImageSource, WebGLTexture>(),
    shaderLoc,
    defaultBitmapShader: { locations: shaderLoc, program: shaderLoc.program, bind: vi.fn() },
    quadVertexBuffer: {} as WebGLBuffer,
    quadIndexBuffer: {} as WebGLBuffer,
    quadVertexData: new Float32Array(16),
    matrixArray: new Float32Array(9),
    scissorStack: [],
    clipForms: [],
    spriteBatchBlendMode: null,
    spriteBatchCount: 0,
    spriteBatchInstanceBuffer: null,
    spriteBatchInstanceData: new Float32Array(13 * 256),
    spriteBatchTexture: null,
  } satisfies Partial<WebGLRenderStateRuntime>);
  state[EntityRuntimeKey] = runtime;

  return { state, gl, canvas, shaderLoc };
}
