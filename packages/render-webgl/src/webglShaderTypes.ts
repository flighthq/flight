import type { BitmapShader } from '@flighthq/types';

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
