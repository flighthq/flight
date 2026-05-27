import type { EntityRuntime, Node, NodeData, NodeDataFactory, NodeRuntimeFactory, PartialNode } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createRuntime as _createRuntime } from './runtime';

export function createNode<D extends NodeData, R extends EntityRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<Node>>,
  createData?: NodeDataFactory<D>,
  createRuntime?: NodeRuntimeFactory<R>,
): Node {
  return {
    data: createData !== undefined ? createData(obj?.data as Partial<D>) : null,
    name: obj?.name ?? null,
    kind: kind,
    [EntityRuntimeKey]: createRuntime !== undefined ? createRuntime() : _createRuntime(),
  } as Node;
}
