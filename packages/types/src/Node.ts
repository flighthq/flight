import type { ColorAdjustmentRuntime } from './ColorAdjustmentRuntime.ts';
import type { Entity, EntityRuntime, EntityRuntimeKey, Kind } from './Entity.ts';
import type { InteractionSignals } from './InteractionSignals.ts';
import type { NodeInteractionState } from './NodeInteractionState.ts';
import type { NodeSignals } from './NodeSignals.ts';
declare const NodeFieldsKey: unique symbol;
export type NodeFieldsKey<T extends object> = symbol & {
  readonly [NodeFieldsKey]?: T;
};
export interface NodeData extends Entity {}
export type NodeDataFactory<D extends NodeData> = () => D;
export type NodeRuntimeFactory<R extends EntityRuntime> = () => R;
export interface NodeFields {
  readonly data: NodeData | null;
  enabled: boolean;
  kind: Kind;
  name: string | null;
}
export interface Node<Fields extends object = NodeFields> extends NodeFields, Entity {
  [EntityRuntimeKey]: NodeRuntime<Fields> | undefined;
}
export type NodeOf<Fields extends object> = Node<Fields> & NoInfer<Fields>;
export interface NodeRuntime<Fields extends object = NodeFields> extends EntityRuntime, ColorAdjustmentRuntime {
  appearanceId: number;
  boundsUsingLocalBoundsId: number;
  boundsUsingLocalTransformId: number;
  canAddChild: (target: Node<Fields>, child: Node<Fields>) => boolean;
  children: NodeOf<Fields>[] | null;
  // Changes whenever this node's child membership or ordering changes. Consumers stamp this
  // independently from localContentId because descendants are not the node's local payload.
  childrenId: number;
  fields?: NodeFieldsKey<Fields>;
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
  parent: NodeOf<Fields> | null;
  // Changes whenever parent-dependent derived state must be recomputed. Effective attach/detach
  // operations always advance it, including reattaching to the same parent later: consumers cannot
  // use parent identity alone because their inherited state may have gone stale while detached.
  parentReferenceId: number;
  worldBoundsUsingLocalBoundsId: number;
  worldBoundsUsingWorldTransformId: number;
  worldTransformId: number;
  // Monotonic source of world-transform revisions for the graph this node roots. Read and advanced
  // only while the node has no parent; every world-transform id stored anywhere in its graph was
  // minted here, which is why reparenting clears the moved subtree's stored ids. Wraps at 32 bits.
  worldTransformRevisionCounter: number;
  worldTransformUsingLocalTransformId: number;
  worldTransformUsingParentTransformId: number;
}
export const NodeKind = 'Node';
export const NullScene3D = Symbol('NullScene3D');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NodeAny = Node<any>;
export type { NodeSignals };
