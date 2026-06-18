import type { Entity, EntityRuntime, EntityRuntimeKey } from './Entity';
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
  kind: symbol;
  name: string | null;
}

export interface Node<Traits extends object = NodeTraits> extends NodeTraits, Entity {
  [EntityRuntimeKey]: NodeRuntime<Traits> | undefined;
}

export interface NodeRuntime<Traits extends object = NodeTraits> extends EntityRuntime {
  appearanceID: number;
  boundsUsingLocalBoundsID: number;
  boundsUsingLocalTransformID: number;
  canAddChild: (target: Node<Traits>, child: Node<Traits>) => boolean;
  children: Node<Traits>[] | null;
  traits?: NodeTraitsKey<Traits>;
  interactionSignals: InteractionSignals | null;
  localBoundsID: number;
  localBoundsUsingLocalBoundsID: number;
  localContentID: number;
  localTransformID: number;
  localTransformUsingLocalTransformID: number;
  nodeSignals: NodeSignals;
  parent: Node<Traits> | null;
  worldBoundsUsingLocalBoundsID: number;
  worldBoundsUsingWorldTransformID: number;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;
}

export const NodeKind: unique symbol = Symbol('Node');
export type NodeOf<Traits extends object> = Node<Traits> & Traits;
export const NullScene: unique symbol = Symbol('NullScene');

// Node<Traits> is invariant in Traits: canAddChild's parameter type makes it contravariant, and
// children/parent make it covariant, so no concrete Traits is a structural supertype of all
// graph families. NodeAny is the explicit escape hatch for parameters and fields that must
// accept nodes from any graph without discriminating on Traits.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NodeAny = Node<any>;

export type { NodeSignals };
