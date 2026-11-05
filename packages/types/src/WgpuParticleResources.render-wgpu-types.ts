export interface WgpuParticleResources {
  instanceBindGroupLayout: GPUBindGroupLayout;
  module: GPUShaderModule;
  pipelineLayout: GPUPipelineLayout;
  pipelines: Map<GPUTextureFormat, GPURenderPipeline>;
}
