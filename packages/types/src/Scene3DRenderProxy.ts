import type { ColorScaleBias } from './ColorScaleBias';
import type { Material } from './Material';
import type { Matrix3 } from './Matrix3';
import type { Matrix4 } from './Matrix4';
import type { MeshSubset } from './MeshGeometry';

// The per-draw resolved record drawScene3D hands one mesh-material renderer for a single Mesh subset.
// drawScene3D walks the scene, and for each Mesh — for each of its subsets paired with its resolved
// material — fills a Scene3DRenderProxy and calls the registered renderer's draw. It is the 3D analog
// of RenderProxy2D: the resolved, render-ready view of a node the backend draws from, with no scene-
// graph traversal concern left in it.
//
// `worldMatrix` is the node's resolved world transform (model matrix); `normalMatrix` is its
// inverse-transpose upper-3x3, precomputed by prepareScene3DRender for transforming normals/tangents
// (it differs from worldMatrix under non-uniform scale). `material` is the resolved Material for this
// subset — never null here, because an unresolved material falls back to the default material kind
// before a proxy is built — and the registry chose this renderer by `material.kind`. `subset` is the
// index range within the geometry's index buffer this draw covers; the geometry itself is passed to
// draw separately (it carries the lazily-uploaded GPU buffers).
//
// The proxy is a reused scratch record owned by drawScene3D, valid only for the duration of the draw
// call it is passed to; a renderer must not retain it.
// `jointMatrices` is the GPU skin palette for this draw — the source Mesh's skin skeleton's
// `jointMatrices` (jointWorld * inverseBind per joint, column-major, 16 floats each). Absent or null
// means the mesh is rigid: drawScene3D sets it only for a skinned mesh, and the HAS_SKIN shader
// variant uploads it and deforms in the vertex scene2d. Optional because rigid draws — the common
// case — carry no palette; a renderer reads it as `proxy.jointMatrices ?? null`.
export interface Scene3DRenderProxy {
  // The resolved per-object opacity in [0, 1] (parent×self worldAlpha). Absent/undefined means fully
  // opaque (= 1); a honoring renderer multiplies its output alpha by this. Optional so existing proxy
  // literals stay valid.
  alpha?: number;
  // Fused pointwise color adjustment for this object. Null keeps the lean base material variant;
  // presence promotes the material renderer to its registered post-shade adjustment variant.
  colorScaleBias?: Readonly<ColorScaleBias> | null;
  colorMatrix?: readonly number[] | null;
  // GPU instance count for an instanced draw. Absent or 0 means a single-instance draw (the common
  // case); a positive value triggers `drawElementsInstanced` and expects `instanceMatrices` to carry
  // the flattened per-instance model matrices (column-major, 16 floats each). Exclusive with skin —
  // an instanced draw never reads `jointMatrices`.
  instanceCount?: number;
  // Flattened per-instance model matrices: `instanceCount` mat4s packed as 16 contiguous floats each
  // (column-major), uploaded to the GPU instance palette texture. The shader multiplies
  // `u_model * instanceModelMatrix()` so each instance's matrix is entity-local. Null/absent when
  // `instanceCount` is 0 or absent.
  instanceMatrices?: Readonly<Float32Array> | null;
  jointMatrices?: Readonly<Float32Array> | null;
  // The matching NORMAL palette for this draw — the skeleton's `normalMatrices`, one inverse-transpose
  // 3x3 per joint as three padded vec4 columns (12 floats each). Carried beside `jointMatrices` because
  // a normal is a covector and does not follow the pose matrix under non-uniform joint scale; a renderer
  // reads it as `proxy.normalMatrices ?? null` and falls back to its rigid path when absent.
  normalMatrices?: Readonly<Float32Array> | null;
  material: Readonly<Material>;
  normalMatrix: Readonly<Matrix3>;
  subset: Readonly<MeshSubset>;
  worldMatrix: Readonly<Matrix4>;
}
