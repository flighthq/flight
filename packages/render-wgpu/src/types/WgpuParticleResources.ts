import type { WgpuBindGroupLayout } from './WgpuBindGroupLayout.ts';
import type { WgpuPipelineLayout } from './WgpuPipelineLayout.ts';
import type { WgpuRenderPipeline } from './WgpuRenderPipeline.ts';
import type { WgpuShaderModule } from './WgpuShaderModule.ts';
import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';
export interface WgpuParticleResources {
  instanceBindGroupLayout: WgpuBindGroupLayout;
  module: WgpuShaderModule;
  pipelineLayout: WgpuPipelineLayout;
  pipelines: Map<WgpuTextureFormat, WgpuRenderPipeline>;
}
