import type { GlParticleShader } from './GlRenderState';

export interface GlParticleResources {
  cornerBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  shader: GlParticleShader;
}
