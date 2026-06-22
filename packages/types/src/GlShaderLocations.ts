import type { GlShader } from './GlShader';

export interface GlShaderLocations {
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

export type GlBitmapShader = GlShader & {
  readonly locations: GlShaderLocations;
};
