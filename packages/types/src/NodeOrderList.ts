import type { Entity } from './Entity.ts';
import type { Node, NodeFields } from './Node.ts';
export interface NodeOrderList<Fields extends object = NodeFields> extends Entity {
  entryCount: number;
  nodes: Node<Fields>[];
  sortKeys: number[];
}
export type NodeOrderListEntryVisitor<Fields extends object = NodeFields> = (
  node: Node<Fields>,
  sortKey: number,
  index: number,
) => boolean | void;
