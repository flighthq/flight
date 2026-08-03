import type { Node, NodeTraits } from './Node';
export interface NodeOrderList<Traits extends object = NodeTraits> {
  count: number;
  keys: number[];
  nodes: Node<Traits>[];
}
