import type { Scene3DLightBlock } from './Scene3DLightBlock';

// State-owned per-visible-mesh light blocks produced by prepareWgpuScene3DForwardLights. The index
// contract matches Scene3DRenderList.visibleMeshes; identical selected tuples share a block.
export interface WgpuScene3DForwardLightList {
  meshCount: number;
  meshLightBlocks: Scene3DLightBlock[];
}
