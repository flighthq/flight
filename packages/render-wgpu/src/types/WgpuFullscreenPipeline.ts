import type { Entity } from '@flighthq/entity/contract';

export interface WgpuFullscreenPipeline extends Entity {
  readonly pipeline: GPURenderPipeline;
  readonly pipelineLayout: GPUPipelineLayout;
  readonly uniformBindGroupLayout: GPUBindGroupLayout;
  readonly textureBindGroupLayouts: ReadonlyArray<GPUBindGroupLayout>;
  readonly emptyUniformBindGroup: GPUBindGroup;
}
