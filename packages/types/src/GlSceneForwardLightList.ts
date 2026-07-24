import type { SceneLightBlock } from './SceneLightBlock';

// The prepared, per-visible-mesh forward-light blocks produced by prepareGlSceneForwardLights.
// `meshLightBlocks[i]` belongs to SceneRenderList.visibleMeshes[i]. Identical selected-light tuples
// share one SceneLightBlock instance so material binds remain batchable across spatially coherent
// meshes. The list and its array are state-owned scratch and must not be retained past the draw.
export interface GlSceneForwardLightList {
  meshCount: number;
  meshLightBlocks: SceneLightBlock[];
}
