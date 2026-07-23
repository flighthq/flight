import { createRenderState } from '@flighthq/render';
import type { GlRenderState, GlRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';
import type { GlShaderLocations } from '@flighthq/types';

import { createGlRenderStateRuntime } from './glRenderState';

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
    canvas,
    gl,
    applyBlendMode: null,
  });

  // Runtime (package-private GPU) fields live on the runtime object stored under EntityRuntimeKey,
  // mirroring what createGlRenderState does in production.
  const runtime = createGlRenderStateRuntime();
  Object.assign(runtime, {
    currentBlendMode: null,
    currentFramebuffer: null,
    currentMaskDepth: 0,
    currentProgram: null,
    currentScissorRect: null,
    currentTexture: null,
    renderTargetViewport: null,
    textureCache: new WeakMap<CanvasImageSource, WebGLTexture>(),
    imageResourceTextureCache: new WeakMap(),
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
  } satisfies Partial<GlRenderStateRuntime>);
  state[EntityRuntimeKey] = runtime;

  return { state, gl, canvas, shaderLoc };
}

// makeGL returns a fresh isolated mock for unit tests that call GL functions
// directly (e.g. shader math tests) and need a clean call-count slate.
// Relies on the jsdom webgl2Mock setup file patching HTMLCanvasElement.getContext.
export function makeGL(): WebGL2RenderingContext {
  const canvas = document.createElement('canvas');
  return canvas.getContext('webgl2') as WebGL2RenderingContext;
}

export function makeShaderLoc(): GlShaderLocations {
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
