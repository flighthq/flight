import type { WebGLRenderStateInternal, WebGLRenderTarget, WebGLShaderLocations } from '@flighthq/render-webgl';

export function makeFilterState(): { state: WebGLRenderStateInternal; gl: WebGL2RenderingContext } {
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
  const state = {
    gl,
    canvas,
    allowSmoothing: true,
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
    applyBlendMode: null,
    currentMaskDepth: 0,
    currentScissorRect: null,
    renderTransform2D: null,
  } as unknown as WebGLRenderStateInternal;
  return { state, gl };
}

export function makeRenderTarget(width = 64, height = 64): WebGLRenderTarget {
  return {
    framebuffer: {} as WebGLFramebuffer,
    texture: {} as WebGLTexture,
    width,
    height,
  };
}

export function makeScratch(count = 3, width = 64, height = 64): WebGLRenderTarget[] {
  return Array.from({ length: count }, () => makeRenderTarget(width, height));
}
