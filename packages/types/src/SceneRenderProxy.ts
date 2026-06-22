import type { Material } from './Material';
import type { Matrix3 } from './Matrix3';
import type { Matrix4 } from './Matrix4';
import type { MeshSubset } from './MeshGeometry';

// The per-draw resolved record drawScene hands one mesh-material renderer for a single Mesh subset.
// drawScene walks the scene, and for each Mesh — for each of its subsets paired with its resolved
// material — fills a SceneRenderProxy and calls the registered renderer's draw. It is the 3D analog
// of RenderProxy2D: the resolved, render-ready view of a node the backend draws from, with no scene-
// graph traversal concern left in it.
//
// `worldMatrix` is the node's resolved world transform (model matrix); `normalMatrix` is its
// inverse-transpose upper-3x3, precomputed by prepareSceneRender for transforming normals/tangents
// (it differs from worldMatrix under non-uniform scale). `material` is the resolved Material for this
// subset — never null here, because an unresolved material falls back to the default material kind
// before a proxy is built — and the registry chose this renderer by `material.kind`. `subset` is the
// index range within the geometry's index buffer this draw covers; the geometry itself is passed to
// draw separately (it carries the lazily-uploaded GPU buffers).
//
// The proxy is a reused scratch record owned by drawScene, valid only for the duration of the draw
// call it is passed to; a renderer must not retain it.
export interface SceneRenderProxy {
  material: Readonly<Material>;
  normalMatrix: Readonly<Matrix3>;
  subset: Readonly<MeshSubset>;
  worldMatrix: Readonly<Matrix4>;
}
