import type { MethodsOf, Node, NodeData, NodeRuntime, PartialNode } from '@flighthq/types';
import { NodeRuntimeKey } from '@flighthq/types';

export type NodeDataFactory<D extends NodeData> = (obj?: Readonly<Partial<D>>) => D;
export type NodeRuntimeFactory<R extends NodeRuntime> = (obj?: Readonly<Partial<R>>) => R;

export function createNode<D extends NodeData, R extends NodeRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<Node>>,
  createData?: NodeDataFactory<D>,
  createRuntime?: NodeRuntimeFactory<R>,
): Node {
  return {
    data: createData !== undefined ? createData(obj?.data as Partial<D>) : null,
    name: obj?.name ?? null,
    kind: kind,
    [NodeRuntimeKey]: createRuntime !== undefined ? createRuntime() : createNodeRuntime(),
  } as Node;
}

export function createNodeRuntime(_methods?: Readonly<Partial<MethodsOf<NodeRuntime>>>): NodeRuntime {
  return {};
}

export function getNodeRuntime(source: Readonly<Node>): Readonly<NodeRuntime> {
  return source[NodeRuntimeKey]!;
}
