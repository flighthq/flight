import type { GlParticleShader } from './GlRenderState.ts';

export interface GlParticleResources {
  cornerBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  shader: GlParticleShader;
}
