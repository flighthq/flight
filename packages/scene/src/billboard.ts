import { enableNodeSignals, getNodeSignals } from '@flighthq/node';
import type {
  Billboard,
  BillboardMode,
  BillboardRuntime,
  Kind,
  Material,
  MeshGeometry,
  NodeSignals,
  SceneNode,
} from '@flighthq/types';
import { BillboardKind } from '@flighthq/types';

import { createSceneNode, getSceneNodeRuntime } from './sceneNode';

export type { Billboard, BillboardMode, BillboardRuntime } from '@flighthq/types';
export { BillboardKind } from '@flighthq/types';

// Allocates a camera-facing Billboard node: a SceneNode (so it shares the scene hierarchy with mesh
// and group nodes) carrying `geometry`, one `materials` entry per geometry subset (positional; a
// missing or null slot resolves to DefaultMaterialKind at draw time), and a facing `mode`. Because a
// Billboard carries geometry it is structurally a drawable leaf (isMesh) and is drawn by the same
// per-material mesh renderers as a Mesh on every backend — the only billboard-specific step is the
// per-frame facing pass (orientBillboardToCamera / orientSceneBillboardsToCamera), which rewrites
// the node's transform so its local axes face the camera before drawing.
//
// Facing convention: the geometry is authored in the local XY plane facing local +Z. The facing pass
// orients local +X to screen-right, local +Y to screen-up, and local +Z toward the camera. `geometry`
// and `materials` are stored by reference, not copied. The node starts with an identity localMatrix
// (unit scale at the origin) until placed and oriented; its authored position and scale are the world
// translation and scale the facing pass preserves.
export function createBillboard(
  geometry: MeshGeometry,
  materials: (Material | null)[],
  mode: BillboardMode = 'full',
  kind: Kind = BillboardKind,
  obj?: Readonly<Partial<Pick<Billboard, 'enabled' | 'name'>>>,
): Billboard {
  const billboard = createSceneNode(kind, obj) as Billboard;
  billboard.geometry = geometry;
  billboard.materials = materials;
  billboard.mode = mode;
  return billboard;
}

export function enableBillboardSignals(source: Billboard): NodeSignals {
  return enableNodeSignals(source);
}

export function getBillboardRuntime(source: Readonly<Billboard>): BillboardRuntime {
  return getSceneNodeRuntime(source);
}

export function getBillboardSignals(source: Billboard): NodeSignals | null {
  return getNodeSignals(source);
}

// A node is a Billboard — a camera-facing drawable — when it carries both geometry (making it a
// drawable leaf) and a facing `mode`. Structural, so it holds for Billboards created with a custom
// kind, not just BillboardKind, and distinguishes a Billboard from a plain Mesh (geometry, no mode).
export function isBillboard(source: Readonly<SceneNode>): source is Billboard {
  const candidate = source as Partial<Billboard>;
  return candidate.geometry != null && candidate.mode != null;
}
