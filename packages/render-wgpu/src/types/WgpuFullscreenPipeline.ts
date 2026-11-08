import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

import type { WgpuBindGroup } from './WgpuBindGroup.ts';
import type { WgpuBindGroupLayout } from './WgpuBindGroupLayout.ts';
import type { WgpuPipelineLayout } from './WgpuPipelineLayout.ts';
import type { WgpuRenderPipeline } from './WgpuRenderPipeline.ts';

export interface WgpuFullscreenPipeline extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  pipeline: WgpuRenderPipeline;
  pipelineLayout: WgpuPipelineLayout;
  uniformBindGroupLayout: WgpuBindGroupLayout;
  textureBindGroupLayouts: ReadonlyArray<WgpuBindGroupLayout>;
  emptyUniformBindGroup: WgpuBindGroup;
}
