import type { BitmapShader, WebGLRenderState } from '@flighthq/types';

export interface WebGLShaderLocations {
  program: WebGLProgram;
  locPosition: number;
  locTexCoord: number;
  locMatrix: WebGLUniformLocation;
  locAlpha: WebGLUniformLocation;
  locColorMultiplier?: WebGLUniformLocation;
  locColorOffset?: WebGLUniformLocation;
  locHasColorTransform?: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

export type WebGLBitmapShader = BitmapShader & {
  readonly locations: WebGLShaderLocations;
};

export type WebGLRenderStateInternal = Omit<WebGLRenderState, 'canvas' | 'gl'> & {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  colorTransformBitmapShader?: WebGLBitmapShader;
  defaultBitmapShader: WebGLBitmapShader;
  shaderLoc: WebGLShaderLocations;
  textureCache: WeakMap<CanvasImageSource, WebGLTexture>;
  quadVertexBuffer: WebGLBuffer;
  quadIndexBuffer: WebGLBuffer;
  quadVertexData: Float32Array;
  matrixArray: Float32Array;
};
