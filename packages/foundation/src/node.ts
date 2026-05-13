import type { Node, NodeData, PartialNode, Runtime } from '@flighthq/types';
import { RuntimeKey } from '@flighthq/types';

import { createRuntime as _createRuntime } from './runtime';

export type NodeDataFactory<D extends NodeData> = (obj?: Readonly<Partial<D>>) => D;
export type NodeRuntimeFactory<R extends Runtime> = (obj?: Readonly<Partial<R>>) => R;

export function createNode<D extends NodeData, R extends Runtime>(
  kind: symbol,
  obj?: Readonly<PartialNode<Node>>,
  createData?: NodeDataFactory<D>,
  createRuntime?: NodeRuntimeFactory<R>,
): Node {
  return {
    data: createData !== undefined ? createData(obj?.data as Partial<D>) : null,
    name: obj?.name ?? null,
    kind: kind,
    [RuntimeKey]: createRuntime !== undefined ? createRuntime() : _createRuntime(),
  } as Node;
}
