import { enableNodeSignals, getNodeSignals } from '@flighthq/node';
import type {
  Billboard,
  BillboardMode,
  BillboardRuntime,
  Kind,
  Material,
  MeshGeometry,
  NodeSignals,
  Node3D,
} from '@flighthq/types';
import { BillboardKind } from '@flighthq/types';

import { createNode3D, getNode3DRuntime } from './sceneNode';

export { BillboardKind } from '@flighthq/types';

// Allocates a camera-facing Billboard node: a Node3D (so it shares the scene hierarchy with mesh
// and group nodes) carrying `geometry`, one `materials` entry per geometry subset (positional; a
// missing or null slot resolves to DefaultMaterialKind at draw time), and a facing `mode`. Because a
// Billboard carries geometry it is structurally a drawable leaf (isMesh) and is drawn by the same
// per-material mesh renderers as a Mesh on every backend — the only billboard-specific step is the
// per-frame facing pass (orientBillboardToCamera / orientScene3DBillboardsToCamera), which rewrites
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
  const billboard = createNode3D(kind, obj) as Billboard;
  billboard.geometry = geometry;
  billboard.materials = materials;
  billboard.mode = mode;
  return billboard;
}

export function enableBillboardSignals(source: Billboard): NodeSignals {
  return enableNodeSignals(source);
}

export function getBillboardRuntime(source: Readonly<Billboard>): BillboardRuntime {
  return getNode3DRuntime(source);
}

export function getBillboardSignals(source: Billboard): NodeSignals | null {
  return getNodeSignals(source);
}

// A node is a Billboard — a camera-facing drawable — when it carries both geometry (making it a
// drawable leaf) and a facing `mode`. Structural, so it holds for Billboards created with a custom
// kind, not just BillboardKind, and distinguishes a Billboard from a plain Mesh (geometry, no mode).
export function isBillboard(source: Readonly<Node3D>): source is Billboard {
  const candidate = source as Partial<Billboard>;
  return candidate.geometry != null && candidate.mode != null;
}
