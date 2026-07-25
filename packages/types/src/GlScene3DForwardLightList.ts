import type { Scene3DLightBlock } from './Scene3DLightBlock';

// The prepared, per-visible-mesh forward-light blocks produced by prepareGlScene3DForwardLights.
// `meshLightBlocks[i]` belongs to Scene3DRenderList.visibleMeshes[i]. Identical selected-light tuples
// share one Scene3DLightBlock instance so material binds remain batchable across spatially coherent
// meshes. The list and its array are state-owned scratch and must not be retained past the draw.
export interface GlScene3DForwardLightList {
  meshCount: number;
  meshLightBlocks: Scene3DLightBlock[];
}
