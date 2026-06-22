import type { Entity, EntityRuntime, EntityRuntimeKey, Kind } from './Entity';
import type { InteractionSignals } from './InteractionSignals';
import type { NodeSignals } from './NodeSignals';

declare const NodeTraitsKey: unique symbol;

export type NodeTraitsKey<T extends object> = symbol & { readonly [NodeTraitsKey]?: T };

export type NodeData = object;

export type NodeDataFactory<D extends NodeData> = (obj?: Readonly<Partial<D>>) => D;

export type NodeRuntimeFactory<R extends EntityRuntime> = (obj?: Readonly<Partial<R>>) => R;

export interface NodeTraits {
  data: NodeData | null;
  enabled: boolean;
  kind: Kind;
  name: string | null;
}

export interface Node<Traits extends object = NodeTraits> extends NodeTraits, Entity {
  [EntityRuntimeKey]: NodeRuntime<Traits> | undefined;
}

export interface NodeRuntime<Traits extends object = NodeTraits> extends EntityRuntime {
  appearanceId: number;
  boundsUsingLocalBoundsId: number;
  boundsUsingLocalTransformId: number;
  canAddChild: (target: Node<Traits>, child: Node<Traits>) => boolean;
  children: Node<Traits>[] | null;
  traits?: NodeTraitsKey<Traits>;
  interactionSignals: InteractionSignals | null;
  localBoundsId: number;
  localBoundsUsingLocalBoundsId: number;
  localContentId: number;
  localTransformId: number;
  localTransformUsingLocalTransformId: number;
  nodeSignals: NodeSignals | null;
  parent: Node<Traits> | null;
  worldBoundsUsingLocalBoundsId: number;
  worldBoundsUsingWorldTransformId: number;
  worldTransformId: number;
  worldTransformUsingLocalTransformId: number;
  worldTransformUsingParentTransformId: number;
}

export const NodeKind = 'Node';
export type NodeOf<Traits extends object> = Node<Traits> & Traits;
export const NullScene: unique symbol = Symbol('NullScene');

// Node<Traits> is invariant in Traits: canAddChild's parameter type makes it contravariant, and
// children/parent make it covariant, so no concrete Traits is a structural supertype of all
// graph families. NodeAny is the explicit escape hatch for parameters and fields that must
// accept nodes from any graph without discriminating on Traits.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NodeAny = Node<any>;

export type { NodeSignals };
