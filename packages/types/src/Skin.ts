import type { SceneNode } from './SceneNode';
import type { Skeleton3D } from './Skeleton3D';

// A mesh skin: the binding that turns a Mesh's per-vertex joint influences (the joints0/weights0
// channels in its geometry layout) into deformation driven by a Skeleton3D. Held as the nullable
// Mesh.skin field — a plain Mesh has skin null and draws rigidly. Skinning is a geometry-layout-
// driven deform/shader variant, not a distinct node kind, so a Mesh gains a skin by field, not by
// type. `skeleton` owns the joints, inverse-bind matrices, and the palette (jointMatrices) that both
// CPU (skinMeshGeometry) and GPU skinning consume. `skeletonRoot` is the optional scene node the
// joint hierarchy hangs under (glTF's per-skin `skeleton` property); null when the source names none.
// A distinct Skin (rather than a bare Skeleton3D on the mesh) leaves room for skin-scoped data that
// is not skeleton-scoped — a joint subset or skeleton root — since several skins can share a skeleton.
export interface Skin {
  skeleton: Skeleton3D;
  skeletonRoot?: SceneNode | null;
}
