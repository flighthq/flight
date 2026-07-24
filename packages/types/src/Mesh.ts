import type { Aabb } from './Aabb';
import type { Material } from './Material';
import type { MeshGeometry } from './MeshGeometry';
import type { MeshMorph } from './MorphTarget';
import type { SceneNode, SceneNodeRuntime } from './SceneNode';
import type { Skin } from './Skin';

// A renderable 3D leaf node. A Mesh shares the SceneNode trait family (so it lives in the same
// hierarchy as group SceneNodes and other Meshes — addNodeChild accepts both) and adds the two
// own fields that make it drawable: the `geometry` to draw and one `materials` entry per geometry
// subset, indexed positionally (subset i is drawn with materials[i]). A subset whose index is past
// the end of `materials`, or whose slot is null, resolves to DefaultMaterialKind at draw time. The
// node's world transform (from HasTransform3D) is the model matrix for every subset. A bare
// SceneNode (no geometry) is a transform-only group; the presence of `geometry` is what makes a
// node a Mesh (isMesh).
//
// `skin` binds the mesh to a Skeleton3D for skeletal deformation: null (or absent) draws rigidly;
// a Skin drives per-frame vertex deformation from the geometry's joints0/weights0 channels
// (updateMeshSkin on CPU, the HAS_SKIN shader variant on GPU). Skinning is a layout-driven variant,
// not a separate node kind, so it is a field here rather than a SkinnedMesh type.
//
// `morph` is the sibling deformer: a set of blend-shape targets plus a live weight array (MeshMorph),
// null/absent for a non-morphed mesh. updateMeshMorph blends base + Σ wᵢ·targetᵢ into geometry.vertices
// each frame; a `Weights` animation channel drives the weights. Like skin it is a field, not a node
// kind, and the two compose (corrective morph over skinning) — see MeshDeformer.
export interface Mesh extends SceneNode {
  geometry: MeshGeometry;
  materials: (Material | null)[];
  morph?: MeshMorph | null;
  skin?: Skin | null;
}

// The deform subsystem's slot on the Mesh node runtime. `deformedLocalBounds` is the mesh's CURRENT
// local-space AABB once a deformer has posed it — the box cull and picking must test against. It
// exists because a GPU-skinned mesh deforms in the shader: geometry.vertices (and therefore the
// geometry's own cached bounds) stay bind pose, so a swung limb would fall outside the bind box and
// be wrongly culled. prepareMeshDeformation writes the joint-driven conservative sweep here each
// frame; consumers read `deformedLocalBounds ?? ensureMeshGeometryBounds(geometry)`.
//
// It lives on the NODE runtime, not the geometry runtime, because the posed box is a function of the
// geometry AND the skeleton posing it — two mesh nodes may share one geometry under different
// skeletons, and a geometry-level slot would thrash between them.
//
// This is deliberately DATA, not a call into skinning: @flighthq/render and @flighthq/picking read
// this slot and must never import @flighthq/skeleton3d, so a rigid or 2D consumer of the renderer
// never bundles the skinning code. Null (or absent) for a rigid or morph-only mesh, which needs no
// slot — its geometry bounds already describe its current pose.
export interface MeshDeformRuntime {
  deformedLocalBounds?: Aabb | null;
}

export type MeshRuntime = SceneNodeRuntime & MeshDeformRuntime;

export const MeshKind = 'Mesh';
