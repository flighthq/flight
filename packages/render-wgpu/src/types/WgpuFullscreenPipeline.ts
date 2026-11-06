import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

export interface WgpuFullscreenPipeline extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly pipeline: GPURenderPipeline;
  readonly pipelineLayout: GPUPipelineLayout;
  readonly uniformBindGroupLayout: GPUBindGroupLayout;
  readonly textureBindGroupLayouts: ReadonlyArray<GPUBindGroupLayout>;
  readonly emptyUniformBindGroup: GPUBindGroup;
}
