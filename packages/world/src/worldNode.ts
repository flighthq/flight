import { createMatrix4 } from '@flighthq/geometry';
import { createNode, createNodeRuntime, getNodeRuntime, getNodeSignals } from '@flighthq/node';
import type { NodeSignals, WorldNode, WorldNodeRuntime, WorldNodeTraits } from '@flighthq/types';
import { WorldGraph, WorldNodeKind } from '@flighthq/types';

export type { WorldNode, WorldNodeRuntime, WorldNodeTraits } from '@flighthq/types';
export { WorldGraph, WorldNodeKind } from '@flighthq/types';

export function createWorldNode(
  kind: symbol = WorldNodeKind,
  obj?: Readonly<Partial<Pick<WorldNode, 'enabled' | 'name'>>>,
): WorldNode {
  const node = createNode<typeof WorldGraph, WorldNodeTraits>(WorldGraph, kind, obj, undefined, createWorldNodeRuntime);
  node.localMatrix = createMatrix4();
  return node as WorldNode;
}

export function createWorldNodeRuntime(): WorldNodeRuntime {
  const out = createNodeRuntime<typeof WorldGraph, WorldNodeTraits>() as WorldNodeRuntime;
  out.worldMatrix = null;
  return out;
}

export function getWorldNodeRuntime(source: Readonly<WorldNode>): WorldNodeRuntime {
  return getNodeRuntime(source) as WorldNodeRuntime;
}

export function getWorldNodeSignals(source: WorldNode): NodeSignals {
  return getNodeSignals(source);
}
