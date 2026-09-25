import type { Entity } from './Entity.ts';
import type { Node, NodeTraits } from './Node.ts';
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
