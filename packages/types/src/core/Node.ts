import type { NodeRuntime, NodeRuntimeKey } from './NodeRuntime';

export interface Node {
  data: NodeData | null;
  kind: symbol;
  name: string | null;

  [NodeRuntimeKey]: NodeRuntime | undefined;
}

export type NodeData = object;

export const NodeKind: unique symbol = Symbol('Node');
