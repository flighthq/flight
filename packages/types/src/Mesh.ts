import type { Material } from './Material';
import type { MeshGeometry } from './MeshGeometry';
import type { SceneNode, SceneNodeRuntime } from './SceneNode';

// A renderable 3D leaf node. A Mesh shares the SceneNode trait family (so it lives in the same
// hierarchy as group SceneNodes and other Meshes — addNodeChild accepts both) and adds the two
// own fields that make it drawable: the `geometry` to draw and one `materials` entry per geometry
// subset, indexed positionally (subset i is drawn with materials[i]). A subset whose index is past
// the end of `materials`, or whose slot is null, resolves to DefaultMaterialKind at draw time. The
// node's world transform (from HasTransform3D) is the model matrix for every subset. A bare
// SceneNode (no geometry) is a transform-only group; the presence of `geometry` is what makes a
// node a Mesh (isMesh).
export interface Mesh extends SceneNode {
  geometry: MeshGeometry;
  materials: (Material | null)[];
}

export type MeshRuntime = SceneNodeRuntime;

export const MeshKind = 'Mesh';
