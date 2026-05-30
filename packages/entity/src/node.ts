import type { EntityRuntime, Node, NodeData, NodeDataFactory, NodeRuntimeFactory, PartialNode } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createEntityRuntime as _createEntityRuntime } from './runtime';

export function createNode<D extends NodeData, R extends EntityRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<Node>>,
  createData?: NodeDataFactory<D>,
  createNodeRuntime?: NodeRuntimeFactory<R>,
): Node {
  return {
    data: createData !== undefined ? createData(obj?.data as Partial<D>) : null,
    name: obj?.name ?? null,
    kind: kind,
    [EntityRuntimeKey]: createNodeRuntime !== undefined ? createNodeRuntime() : _createEntityRuntime(),
  } as Node;
}
