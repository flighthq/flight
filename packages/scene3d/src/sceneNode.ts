import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createNodeRuntime,
  enableNodeSignals,
  getNodeRuntime,
  getNodeSignals,
  initAppearanceRuntimeTrait,
  initAppearanceTrait,
  initializeNode,
  initTransform3DRuntimeTrait,
  initTransform3DTrait,
} from '@flighthq/node/contract';
import type { Kind, NodeAny, NodeSignals, Node3D, Node3DRuntime, Node3DFields } from '@flighthq/types/contract';
import { Node3DKind, Node3DFieldsKey } from '@flighthq/types/contract';

export { Node3DKind } from '@flighthq/types/contract';

export function createNode3D(kind: Kind = Node3DKind): Node3D {
  const out = allocateEntity<Node3D>();
  initializeNode(out, kind, undefined, createNode3DRuntime);
  initAppearanceTrait(out);
  initTransform3DTrait(out);
  return finishEntity(out);
}

export function createNode3DRuntime(): Node3DRuntime {
  const out = createNodeRuntime<Node3DFields>() as Node3DRuntime;
  out.fields = Node3DFieldsKey;
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

export function isNode3D(node: NodeAny): node is Node3D {
  return getNodeRuntime(node).fields === Node3DFieldsKey;
}
