import { createRenderState } from '@flighthq/render';

import type { WebGLRenderStateInternal } from './internal';
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
  state: WebGLRenderStateInternal;
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
  }) as WebGLRenderStateInternal;

  Object.assign(state, {
    canvas,
    gl,
    applyBlendMode: null,
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
  });
  return { state, gl, canvas, shaderLoc };
}
