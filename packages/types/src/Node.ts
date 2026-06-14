import type { EntityRuntime, EntityRuntimeKey } from './Entity';
import type { HasHierarchy, HasHierarchyRuntime } from './HasHierarchy';
import type { InteractionSignals } from './InteractionSignals';
import type { NodeSignals } from './NodeSignals';

export type NodeData = object;

export type NodeDataFactory<D extends NodeData> = (obj?: Readonly<Partial<D>>) => D;

export type NodeRuntimeFactory<R extends EntityRuntime> = (obj?: Readonly<Partial<R>>) => R;

export interface NodeTraits {
  data: NodeData | null;
  enabled: boolean;
  kind: symbol;
  name: string | null;
}

export interface Node<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits>
  extends NodeTraits, HasHierarchy {
  [EntityRuntimeKey]: NodeRuntime<Kind, Traits> | undefined;
}

export interface NodeRuntime<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits>
  extends EntityRuntime, HasHierarchyRuntime<Kind, Traits> {
  appearanceID: number;
  boundsUsingLocalBoundsID: number;
  boundsUsingLocalTransformID: number;
  graph: Kind;
  interactionSignals: InteractionSignals | null;
  localBoundsID: number;
  localBoundsUsingLocalBoundsID: number;
  localTransformID: number;
  localTransformUsingLocalTransformID: number;
  worldBoundsUsingLocalBoundsID: number;
  worldBoundsUsingWorldTransformID: number;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;
}

export const NodeKind: unique symbol = Symbol('Node');
export type NodeOf<Kind extends symbol, Traits extends object> = Node<Kind, Traits> & Traits;
export const NullScene: unique symbol = Symbol('NullScene');

export type { NodeSignals };
