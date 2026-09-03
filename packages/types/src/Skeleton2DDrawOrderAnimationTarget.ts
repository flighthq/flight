import type { Entity } from './Entity';
import type { Node, NodeTraits } from './Node';
import type { NodeOrderList } from './NodeOrderList';
import type { Skeleton2DAnimationTargetKind } from './Skeleton2DAnimationTargetKind';

/**
 * The binding target an `AnimationChannel` carries when it reorders a rig's drawing rather than moving
 * it — Spine's draw-order timeline, and the second consumer of the same structure Rive's
 * `DrawRules`/`DrawTarget` already import through.
 *
 * **Ordering is caller-owned and never node state**, per [draw order model](draw-order-model.md), so the
 * target carries the `NodeOrderList` it writes into rather than the binder reaching for one. The binder
 * fills the list; applying it to the parent stays the caller's explicit step, exactly as posing bones
 * leaves the world-transform pass to the caller.
 *
 * `nodes` maps a slot index to the display node that slot draws, or `null` where it draws nothing —
 * a lookup table for the same reason `Skeleton2DSlotAnimationTarget` carries its attachments, since a
 * `Slot2D` knows what it wears and not where it lands in someone else's scene.
 *
 * The channel's track holds one **full ordering per keyframe**: `components` is the slot count, and the
 * value at each slot's offset is that slot's sort key on that frame. A draw order is walked as steps
 * whatever the track states — interpolating two orderings yields fractional sort keys and a sequence
 * nobody authored — and that coercion reports through `enableSkeleton2DGuards`.
 */
export interface Skeleton2DDrawOrderAnimationTarget<Traits extends object = NodeTraits> extends Entity {
  kind: Skeleton2DAnimationTargetKind;
  nodes: readonly (Node<Traits> | null)[];
  orderList: NodeOrderList<Traits>;
}
