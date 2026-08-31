import type { ColorAdjustmentRuntime } from './ColorAdjustmentRuntime';
import type { Entity, EntityRuntime, EntityRuntimeKey, Kind } from './Entity';
import type { InteractionSignals } from './InteractionSignals';
import type { NodeInteractionState } from './NodeInteractionState';
import type { NodeSignals } from './NodeSignals';
declare const NodeTraitsKey: unique symbol;
export type NodeTraitsKey<T extends object> = symbol & {
  readonly [NodeTraitsKey]?: T;
};
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
export type NodeOf<Traits extends object> = Node<Traits> & NoInfer<Traits>;
export interface NodeRuntime<Traits extends object = NodeTraits> extends EntityRuntime, ColorAdjustmentRuntime {
  appearanceId: number;
  boundsUsingLocalBoundsId: number;
  boundsUsingLocalTransformId: number;
  canAddChild: (target: Node<Traits>, child: Node<Traits>) => boolean;
  children: NodeOf<Traits>[] | null;
  // Changes whenever this node's child membership or ordering changes. Consumers stamp this
  // independently from localContentId because descendants are not the node's local payload.
  childrenId: number;
  traits?: NodeTraitsKey<Traits>;
  interactionSignals: InteractionSignals | null;
  localBoundsId: number;
  localBoundsUsingLocalBoundsId: number;
  localContentId: number;
  localTransformId: number;
  localTransformUsingLocalTransformId: number;
  nodeSignals: NodeSignals | null;
  // Interaction subsystem slot (off the entity, like nodeSignals): per-node hit-test gating, hit-area
  // proxy, rollover cursor, and focus/tab settings. `null` → all defaults (fully hit-testable, no
  // cursor, not focusable). Owned and read by `@flighthq/interaction`.
  interactionState: NodeInteractionState | null;
  parent: NodeOf<Traits> | null;
  // Changes whenever parent-dependent derived state must be recomputed. Effective attach/detach
  // operations always advance it, including reattaching to the same parent later: consumers cannot
  // use parent identity alone because their inherited state may have gone stale while detached.
  parentReferenceId: number;
  worldBoundsUsingLocalBoundsId: number;
  worldBoundsUsingWorldTransformId: number;
  worldTransformId: number;
  worldTransformUsingLocalTransformId: number;
  worldTransformUsingParentTransformId: number;
}
export const NodeKind = 'Node';
export const NullScene3D = Symbol('NullScene3D');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NodeAny = Node<any>;
export type { NodeSignals };
