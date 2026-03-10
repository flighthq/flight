import type { GraphNodeRuntime } from './GraphNodeRuntime';
import type { Node, NodeData } from './Node';
import type { NodeRuntimeKey } from './NodeRuntime';

export interface GraphNode<G extends symbol> extends Node {
  readonly children: GraphNode<G>[] | null;
  readonly parent: GraphNode<G> | null;
  visible: boolean;

  [NodeRuntimeKey]: GraphNodeRuntime<G> | undefined;
}

export interface GraphNodeData extends NodeData {}

export const GraphNodeKind: unique symbol = Symbol('GraphNode');
