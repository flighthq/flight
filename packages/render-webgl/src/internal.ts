import type { WebGLRenderState } from '@flighthq/types';

import type { WebGLBitmapShader, WebGLShaderLocations } from './webglShaderTypes';

export type { WebGLBitmapShader, WebGLShaderLocations };

export interface WebGLParticleShader {
  program: WebGLProgram;
  locCorner: number;
  locPos: number;
  locCosScale: number;
  locSinScale: number;
  locColor: number;
  locUVRect: number;
  locSize: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

export interface WebGLQuadBatchShader {
  program: WebGLProgram;
  locCorner: number;
  locMatAB: number;
  locMatCD: number;
  locMatTXTY: number;
  locSize: number;
  locUVRect: number;
  locWorldMatrix: WebGLUniformLocation;
  locAlpha: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

export type WebGLRenderStateInternal = Omit<WebGLRenderState, 'canvas' | 'gl'> & {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  colorTransformBitmapShader?: WebGLBitmapShader;
  defaultBitmapShader: WebGLBitmapShader;
  particleShader?: WebGLParticleShader;
  particleCornerBuffer?: WebGLBuffer;
  particleInstanceBuffer?: WebGLBuffer;
  particleInstanceData?: Float32Array;
  quadBatchShader?: WebGLQuadBatchShader;
  quadBatchCornerBuffer?: WebGLBuffer;
  quadBatchInstanceBuffer?: WebGLBuffer;
  quadBatchInstanceData?: Float32Array;
  currentMaskDepth?: number;
  currentScissorRect?: WebGLScissorRect | null;
  /**
   * The framebuffer currently bound for rendering. Null means the default
   * (screen) framebuffer. Maintained internally so begin/end render target
   * can restore the previous binding without a gl.getParameter() call.
   */
  currentFramebuffer: WebGLFramebuffer | null;
  /**
   * When rendering into a WebGLRenderTarget, overrides the canvas dimensions
   * used for clip-space projection and scissor rect computation. Null means
   * use canvas.width / canvas.height (normal on-screen rendering).
   */
  renderTargetViewport: { width: number; height: number } | null;
  shaderLoc: WebGLShaderLocations;
  textureCache: WeakMap<CanvasImageSource, WebGLTexture>;
  quadVertexBuffer: WebGLBuffer;
  quadIndexBuffer: WebGLBuffer;
  quadVertexData: Float32Array;
  matrixArray: Float32Array;
  scissorStack?: WebGLScissorRect[];
};

export interface WebGLScissorRect {
  height: number;
  width: number;
  x: number;
  y: number;
}
