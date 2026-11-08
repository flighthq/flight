import type { WgpuBindGroupLayout } from './WgpuBindGroupLayout.ts';
import type { WgpuPipelineLayout } from './WgpuPipelineLayout.ts';
import type { WgpuRenderPipeline } from './WgpuRenderPipeline.ts';
import type { WgpuShaderModule } from './WgpuShaderModule.ts';
export interface WgpuQuadBatchResources {
  instanceBindGroupLayout: WgpuBindGroupLayout;
  materialBindGroupLayout: WgpuBindGroupLayout;
  basePipelineLayout: WgpuPipelineLayout;
  materialPipelineLayout: WgpuPipelineLayout;
  // Pipelines keyed first by the material's shader module, then by blend+stencil state.
  pipelines: WeakMap<WgpuShaderModule, Map<string, WgpuRenderPipeline>>;
}
