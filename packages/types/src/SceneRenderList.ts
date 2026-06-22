import type { Matrix4 } from './Matrix4';
import type { Mesh } from './Mesh';
import type { SceneLightBlock } from './SceneLightBlock';

// The prepared, render-ready frame produced by prepareSceneRender and consumed by the backend
// drawScene. prepareSceneRender walks the scene once per frame — propagating world transforms,
// computing the camera view-projection, frustum-culling, and packing lights — and leaves only
// the work the backend cannot do without a GPU context (uploading buffers, binding, drawing).
//
// `visibleMeshes` is the subset of the scene's Mesh nodes whose world-space bounds intersect the
// camera frustum, in scene-graph (front-to-back-agnostic) order; their world matrices are resolved
// on the node runtime (HasTransform3DRuntime.worldMatrix). `viewProjection` is projection × view
// for the draw camera. `lights` is the packed light environment. `meshCount` is the live length of
// `visibleMeshes` — the array is a reused scratch buffer owned by the producer that may be longer
// than the visible count, so consumers must iterate to `meshCount`, not `visibleMeshes.length`.
//
// The list is reused scratch owned by the render state across frames; a consumer must not retain
// it past the drawScene it is passed to.
export interface SceneRenderList {
  lights: Readonly<SceneLightBlock>;
  meshCount: number;
  viewProjection: Readonly<Matrix4>;
  visibleMeshes: Mesh[];
}
