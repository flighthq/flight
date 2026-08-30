import type { GlQuadBatchShader } from './GlRenderState';

export interface GlQuadBatchResources {
  cornerBuffer: WebGLBuffer;
  shader: GlQuadBatchShader;
  writerColorScaleBiasBuffer: WebGLBuffer | null;
  writerInstanceBuffer: WebGLBuffer | null;
  writerMaterialBuffer: WebGLBuffer | null;
}
