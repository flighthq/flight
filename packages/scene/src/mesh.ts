import { cloneMeshGeometryForDeformation } from '@flighthq/mesh';
import {
  enableNodeSignals,
  getNodeLocalMatrix4,
  getNodeSignals,
  isNodeLocalMatrix4Detached,
  setNodeLocalMatrix4,
  setNodeTransform3D,
} from '@flighthq/node';
import type { Kind, Material, Mesh, MeshDeformer, MeshGeometry, MeshRuntime, NodeSignals } from '@flighthq/types';
import { MeshDeformerMorph, MeshDeformerNone, MeshDeformerSkeletal, MeshKind } from '@flighthq/types';

import { createSceneNode, getSceneNodeRuntime } from './sceneNode';

export type { Mesh, MeshRuntime } from '@flighthq/types';
export { MeshKind } from '@flighthq/types';

// Clones a Mesh node: a new node carrying a COPY of the source's transform. Rigid clones share their
// geometry; a mesh carrying morph or skin gets a restored, runtime-independent geometry because CPU
// deformation writes vertices in place. Morph targets remain shared immutable data while the live
// weight array is copied. Skin/skeleton pose is still shared explicitly; callers wanting an
// independent rig clone its joint hierarchy and Skeleton3D separately. `alpha`, `enabled`, `name`,
// and `kind` are copied. Only the mesh node itself is cloned;
// its children are not (a Mesh is a drawable leaf — clone each node you need explicitly). There is
// no general cloneSceneNode: not every node kind can be duplicated (some own GPU/native resources
// or runtime bindings that cannot alias), so cloning is a per-type capability, defined here where
// it is well-formed.
export function cloneMesh(source: Readonly<Mesh>): Mesh {
  const hasDeformation = source.skin != null || source.morph != null;
  const geometry = hasDeformation ? cloneMeshGeometryForDeformation(source.geometry) : source.geometry;
  const clone = createMesh(geometry, source.materials.slice(), source.kind, {
    enabled: source.enabled,
    name: source.name,
  });
  clone.alpha = source.alpha;
  // Copy the authored TRS; if the source authored its matrix directly, carry that detached matrix too.
  setNodeTransform3D(clone, source);
  if (isNodeLocalMatrix4Detached(source)) setNodeLocalMatrix4(clone, getNodeLocalMatrix4(source));
  if (source.skin != null) clone.skin = source.skin;
  if (source.morph != null) {
    clone.morph = { targets: source.morph.targets, weights: new Float32Array(source.morph.weights) };
  }
  return clone;
}

// Allocates a renderable Mesh node: a SceneNode (so it shares the scene hierarchy with group nodes
// and other meshes) carrying `geometry` and one `materials` entry per geometry subset (indexed
// positionally; a missing or null slot resolves to DefaultMaterialKind at draw time). The node has
// an identity localMatrix — its model matrix once placed in the hierarchy — and no children.
// `geometry` and `materials` are stored by reference, not copied.
export function createMesh(
  geometry: MeshGeometry,
  materials: (Material | null)[],
  kind: Kind = MeshKind,
  obj?: Readonly<Partial<Pick<Mesh, 'enabled' | 'name'>>>,
): Mesh {
  const mesh = createSceneNode(kind, obj) as Mesh;
  mesh.geometry = geometry;
  mesh.materials = materials;
  return mesh;
}

export function enableMeshSignals(source: Mesh): NodeSignals {
  return enableNodeSignals(source);
}

// The deformer a mesh runs each frame, derived from which deform field is populated: 'skeletal' when
// it carries a skin, 'morph' when it carries a morph target set, 'none' when neither (rigid). A mesh
// carrying both (corrective morph over skinning) reports 'skeletal' — the skin is the outer deform,
// applied over the morph-blended base (see updateMeshMorph then updateMeshSkin) — so this single tag
// names the outermost deform for a renderer or bounds pass; query mesh.skin/mesh.morph directly for the
// composed case. Renderers branch on this rather than duplicating the field checks.
export function getMeshDeformer(source: Readonly<Mesh>): MeshDeformer {
  if (source.skin != null) return MeshDeformerSkeletal;
  if (source.morph != null) return MeshDeformerMorph;
  return MeshDeformerNone;
}

export function getMeshRuntime(source: Readonly<Mesh>): MeshRuntime {
  return getSceneNodeRuntime(source);
}

export function getMeshSignals(source: Mesh): NodeSignals | null {
  return getNodeSignals(source);
}

// A node is a Mesh — a drawable leaf, not a transform-only group — when it carries geometry.
// Robust across custom kinds (a Mesh need not use MeshKind), so the scene render pass discriminates
// by this rather than by kind symbol.
export function isMesh(source: any): source is Mesh {
  // eslint-disable-line
  return (source as Partial<Mesh>).geometry != null;
}
