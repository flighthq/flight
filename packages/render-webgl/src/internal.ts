import type { WebGLRenderState } from '@flighthq/types';

import type { WebGLBitmapShader, WebGLShaderLocations } from './webglShaderTypes';

export type { WebGLBitmapShader, WebGLShaderLocations };

export type WebGLRenderStateInternal = Omit<WebGLRenderState, 'canvas' | 'gl'> & {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  colorTransformBitmapShader?: WebGLBitmapShader;
  defaultBitmapShader: WebGLBitmapShader;
  currentMaskDepth?: number;
  currentScissorRect?: WebGLScissorRect | null;
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
