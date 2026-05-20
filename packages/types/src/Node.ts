import type { Entity, EntityRuntime } from './Entity';

export interface Node extends Entity {
  data: NodeData | null;
  kind: symbol;
  name: string | null;
}

export type NodeData = object;

export type NodeDataFactory<D extends NodeData> = (obj?: Readonly<Partial<D>>) => D;

export type NodeRuntimeFactory<R extends EntityRuntime> = (obj?: Readonly<Partial<R>>) => R;

export const NodeKind: unique symbol = Symbol('Node');
