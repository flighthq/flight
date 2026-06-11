import type { WebGLShader } from './WebGLShader';

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

export type WebGLBitmapShader = WebGLShader & {
  readonly locations: WebGLShaderLocations;
};
