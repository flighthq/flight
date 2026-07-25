import {
  createNode,
  createNodeRuntime,
  enableNodeSignals,
  getNodeRuntime,
  getNodeSignals,
  initAppearanceTrait,
  initTransform3DRuntimeTrait,
  initTransform3DTrait,
} from '@flighthq/node';
import type { Kind, NodeSignals, Node3D, Node3DRuntime, Node3DTraits } from '@flighthq/types';
import { Node3DKind, Node3DTraitsKey } from '@flighthq/types';

export { Node3DKind } from '@flighthq/types';

export function createNode3D(
  kind: Kind = Node3DKind,
  obj?: Readonly<Partial<Pick<Node3D, 'alpha' | 'enabled' | 'name' | 'visible'>>>,
): Node3D {
  const node = createNode<Node3DTraits>(kind, obj, undefined, createNode3DRuntime);
  initAppearanceTrait(node, obj);
  initTransform3DTrait(node);
  return node as Node3D;
}

export function createNode3DRuntime(): Node3DRuntime {
  const out = createNodeRuntime<Node3DTraits>() as Node3DRuntime;
  out.traits = Node3DTraitsKey;
  out.worldAlpha = null;
  out.worldAlphaUsingAppearanceId = -1;
  out.worldAlphaUsingParentAppearanceId = -1;
  out.worldAppearanceId = 0;
  initTransform3DRuntimeTrait(out);
  return out;
}

export function enableNode3DSignals(source: Node3D): NodeSignals {
  return enableNodeSignals(source);
}

export function getNode3DRuntime(source: Readonly<Node3D>): Node3DRuntime {
  return getNodeRuntime(source) as Node3DRuntime;
}

export function getNode3DSignals(source: Node3D): NodeSignals | null {
  return getNodeSignals(source);
}
