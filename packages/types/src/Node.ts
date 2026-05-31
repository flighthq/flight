import type { Entity, EntityRuntime } from './Entity';

export interface Node extends Entity {
  data: NodeData | null;
  kind: symbol;
  name: string | null;
}

/**
 * Base runtime for all nodes. Add a nullable slot here when a subsystem
 * applies to every node kind. Initialize it to null in createNodeRuntime.
 */
export interface NodeRuntime extends EntityRuntime {}

export type NodeData = object;

export type NodeDataFactory<D extends NodeData> = (obj?: Readonly<Partial<D>>) => D;

export type NodeRuntimeFactory<R extends NodeRuntime> = (obj?: Readonly<Partial<R>>) => R;

export const NodeKind: unique symbol = Symbol('Node');
