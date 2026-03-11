import type { Node, NodeData, NodeRuntimeKey } from '../../../index';
import type { GraphNodeRuntime } from './GraphNodeRuntime';

export interface GraphNode<G extends symbol> extends Node {
  visible: boolean;

  [NodeRuntimeKey]: GraphNodeRuntime<G> | undefined;
}

export interface GraphNodeData extends NodeData {}

export const GraphNodeKind: unique symbol = Symbol('GraphNode');
