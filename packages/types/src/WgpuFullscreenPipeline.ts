export interface WgpuFullscreenPipeline {
  readonly pipeline: GPURenderPipeline;
  readonly pipelineLayout: GPUPipelineLayout;
  readonly uniformBindGroupLayout: GPUBindGroupLayout;
  readonly textureBindGroupLayouts: ReadonlyArray<GPUBindGroupLayout>;
}
