import {
  createNode,
  createNodeRuntime,
  enableNodeSignals,
  getNodeRuntime,
  getNodeSignals,
  initAppearanceRuntimeTrait,
  initAppearanceTrait,
  initTransform3DRuntimeTrait,
  initTransform3DTrait,
} from '@flighthq/node/contract';
import type { Kind, NodeSignals, Node3D, Node3DRuntime, Node3DTraits } from '@flighthq/types/contract';
import { Node3DKind, Node3DTraitsKey } from '@flighthq/types/contract';

export { Node3DKind } from '@flighthq/types/contract';

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
  initAppearanceRuntimeTrait(out);
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
