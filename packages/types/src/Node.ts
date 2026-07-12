import type { Adjustment } from './Adjustment';
import type { ColorTransform } from './ColorTransform';
import type { Entity, EntityRuntime, EntityRuntimeKey, Kind } from './Entity';
import type { InteractionSignals } from './InteractionSignals';
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
export interface NodeRuntime<Traits extends object = NodeTraits> extends EntityRuntime {
  appearanceId: number;
  boundsUsingLocalBoundsId: number;
  boundsUsingLocalTransformId: number;
  canAddChild: (target: Node<Traits>, child: Node<Traits>) => boolean;
  children: Node<Traits>[] | null;
  // Adjustment-tier subsystem slot (off the entity, like nodeSignals): the node's pointwise
  // color-adjustment stack — the source of truth, default `null` → no adjustments. Set through
  // `setDisplayObjectColorAdjustments`, which fuses it once (on change, not per frame) into the affine
  // `resolvedColorTransform` cache below; the render walk just hands that cache to the inline fold as
  // `RenderProxy.colorTransform`, so the hot path is identical to reading the old `.colorTransform` and
  // the fuse math never weighs on the base render bundle.
  colorAdjustments: readonly Adjustment[] | null;
  // Cached affine resolution of `colorAdjustments` (fused once on set). `null` → the stack resolves to no
  // tint. When the fused stack carries off-diagonal channel-mixing terms the 8-float fold cannot represent
  // yet (the deferred 4×5 path), this holds only the affine part and `colorAdjustmentsChannelMixing` is set.
  resolvedColorTransform: ColorTransform | null;
  colorAdjustmentsChannelMixing: boolean;
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
export const NullScene = Symbol('NullScene');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NodeAny = Node<any>;
export type { NodeSignals };
