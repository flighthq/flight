import type { WebGLRenderTarget, WebGLShaderLocations } from '@flighthq/render-webgl';
import type { WebGLRenderState, WebGLRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export function makeFilterState(): { state: WebGLRenderState; gl: WebGL2RenderingContext } {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
  const shaderLoc: WebGLShaderLocations = {
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
  const runtime = {
    currentFramebuffer: null,
    renderTargetViewport: null,
    currentTexture: null,
    currentBlendMode: null,
    currentProgram: null,
    quadVertexBuffer: {} as WebGLBuffer,
    quadIndexBuffer: {} as WebGLBuffer,
    quadVertexData: new Float32Array(16),
    matrixArray: new Float32Array(9),
    shaderLoc,
    defaultBitmapShader: { locations: shaderLoc },
    scissorStack: [],
    textureCache: new WeakMap(),
    currentMaskDepth: 0,
    currentScissorRect: null,
  } as unknown as WebGLRenderStateRuntime;
  const state = {
    gl,
    canvas,
    allowSmoothing: true,
    applyBlendMode: null,
    renderTransform2D: null,
    [EntityRuntimeKey]: runtime,
  } as unknown as WebGLRenderState;
  return { state, gl };
}

export function makeRenderTarget(width = 64, height = 64): WebGLRenderTarget {
  const texture = {} as WebGLTexture;
  return {
    framebuffer: {} as WebGLFramebuffer,
    resolveFramebuffer: null,
    texture,
    textures: [texture],
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: null,
    format: 'rgba8',
    sampleCount: 1,
    width,
    height,
  };
}

export function makeScratch(count = 3, width = 64, height = 64): WebGLRenderTarget[] {
  return Array.from({ length: count }, () => makeRenderTarget(width, height));
}
