import { enableNodeSignals, getNodeSignals } from '@flighthq/node';
import type { Kind, Material, Mesh, MeshGeometry, MeshRuntime, NodeSignals, SceneNode } from '@flighthq/types';
import { MeshKind } from '@flighthq/types';

import { createSceneNode, getSceneNodeRuntime } from './sceneNode';

export type { Mesh, MeshRuntime } from '@flighthq/types';
export { MeshKind } from '@flighthq/types';

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

export function getMeshRuntime(source: Readonly<Mesh>): MeshRuntime {
  return getSceneNodeRuntime(source);
}

export function getMeshSignals(source: Mesh): NodeSignals | null {
  return getNodeSignals(source);
}

// A node is a Mesh — a drawable leaf, not a transform-only group — when it carries geometry.
// Robust across custom kinds (a Mesh need not use MeshKind), so the scene render pass discriminates
// by this rather than by kind symbol.
export function isMesh(source: Readonly<SceneNode>): source is Mesh {
  return (source as Partial<Mesh>).geometry != null;
}
