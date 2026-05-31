import type { Node, NodeData, NodeDataFactory, NodeRuntime, NodeRuntimeFactory, PartialNode } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createNodeRuntime as _createNodeRuntime } from './runtime';

export function createNode<D extends NodeData, R extends NodeRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<Node>>,
  createData?: NodeDataFactory<D>,
  createNodeRuntime?: NodeRuntimeFactory<R>,
): Node {
  return {
    data: createData !== undefined ? createData(obj?.data as Partial<D>) : null,
    name: obj?.name ?? null,
    kind: kind,
    [EntityRuntimeKey]: createNodeRuntime !== undefined ? createNodeRuntime() : _createNodeRuntime(),
  } as Node;
}
