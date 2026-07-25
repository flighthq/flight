import type { SceneLightBlock } from './SceneLightBlock';

// State-owned per-visible-mesh light blocks produced by prepareWgpuSceneForwardLights. The index
// contract matches SceneRenderList.visibleMeshes; identical selected tuples share a block.
export interface WgpuSceneForwardLightList {
  meshCount: number;
  meshLightBlocks: SceneLightBlock[];
}
