import type { Entity } from './Entity';

export interface WgpuFullscreenPipeline extends Entity {
  readonly pipeline: GPURenderPipeline;
  readonly pipelineLayout: GPUPipelineLayout;
  readonly uniformBindGroupLayout: GPUBindGroupLayout;
  readonly textureBindGroupLayouts: ReadonlyArray<GPUBindGroupLayout>;
}
