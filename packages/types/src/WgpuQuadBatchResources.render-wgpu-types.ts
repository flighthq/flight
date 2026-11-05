export interface WgpuQuadBatchResources {
  instanceBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  basePipelineLayout: GPUPipelineLayout;
  materialPipelineLayout: GPUPipelineLayout;
  // Pipelines keyed first by the material's shader module, then by blend+stencil state.
  pipelines: WeakMap<GPUShaderModule, Map<string, GPURenderPipeline>>;
}
