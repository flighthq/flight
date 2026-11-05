import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

import type { Node, NodeFields } from './Node.ts';
export interface NodeOrderList<Fields extends object = NodeFields> extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  entryCount: number;
  nodes: Node<Fields>[];
  sortKeys: number[];
}
export type NodeOrderListEntryVisitor<Fields extends object = NodeFields> = (
  node: Node<Fields>,
  sortKey: number,
  index: number,
) => boolean | void;
