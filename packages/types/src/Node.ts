import type { Entity } from './Entity';

export interface Node extends Entity {
  data: NodeData | null;
  kind: symbol;
  name: string | null;
}

export type NodeData = object;

export const NodeKind: unique symbol = Symbol('Node');
