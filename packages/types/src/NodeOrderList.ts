import type { Entity } from './Entity';
import type { Node, NodeTraits } from './Node';
export interface NodeOrderList<Traits extends object = NodeTraits> extends Entity {
  entryCount: number;
  nodes: Node<Traits>[];
  sortKeys: number[];
}
export type NodeOrderListEntryVisitor<Traits extends object = NodeTraits> = (
  node: Node<Traits>,
  sortKey: number,
  index: number,
) => boolean | void;
