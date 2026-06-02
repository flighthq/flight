import type { Entity, EntityRuntime } from './Entity';

export type SceneNodeData = object;

export type SceneNodeDataFactory<D extends SceneNodeData> = (obj?: Readonly<Partial<D>>) => D;

export type SceneNodeRuntimeFactory<R extends EntityRuntime> = (obj?: Readonly<Partial<R>>) => R;

/**
 * Minimal base retained for transition. SceneNode (in SceneNode.ts) is the
 * canonical authored scene graph node type.
 */
export interface Node extends Entity {
  data: SceneNodeData | null;
  kind: symbol;
  name: string | null;
}
