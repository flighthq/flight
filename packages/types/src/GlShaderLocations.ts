import type { Entity } from './Entity';
import type { GlShader } from './GlShader';

export interface GlShaderLocations {
  program: WebGLProgram;
  locPosition: number;
  locTexCoord: number;
  locMatrix: WebGLUniformLocation;
  locAlpha: WebGLUniformLocation;
  locColorScale?: WebGLUniformLocation;
  locColorBias?: WebGLUniformLocation;
  locHasColorScaleBias?: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

export type GlBitmapShader = Entity &
  GlShader & {
    readonly locations: GlShaderLocations;
  };
