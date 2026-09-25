import type { GlQuadBatchShader } from './GlRenderState.ts';

export interface GlQuadBatchResources {
  cornerBuffer: WebGLBuffer;
  shader: GlQuadBatchShader;
  writerColorScaleBiasBuffer: WebGLBuffer | null;
  writerInstanceBuffer: WebGLBuffer | null;
  writerMaterialBuffer: WebGLBuffer | null;
}
