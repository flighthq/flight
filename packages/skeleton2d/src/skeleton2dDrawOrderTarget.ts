import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { addNodeOrderListEntry, clearNodeOrderList } from '@flighthq/node/contract';
import type {
  AnimationChannel,
  EntityConstruction,
  Node,
  NodeOrderList,
  NodeTraits,
  Skeleton2DDrawOrderAnimationTarget,
  Skeleton2DDrawOrderTimeline,
} from '@flighthq/types/contract';
import { Skeleton2DAnimationTargetKind as TargetKind } from '@flighthq/types/contract';

import {
  findSkeleton2DStepKeyframe,
  registerSkeleton2DAnimationTargetBinder,
  unregisterSkeleton2DAnimationTargetBinder,
} from './skeleton2dAnimationTarget';
import { reportSkeleton2DCoercedInterpolation } from './skeleton2dGuards';

/**
 * The binding target for a draw-order channel. Prefer this over a literal: `kind` is what the binder
 * dispatches on, and a target that omits it binds to nothing.
 *
 * `nodes` maps slot index to the display node that slot draws, `null` where it draws nothing. `orderList`
 * is the caller's own list — ordering is never node state — and the binder fills it rather than applying
 * it, leaving `applyNodeOrderList` an explicit step the caller takes once per frame.
 */
export function createSkeleton2DDrawOrderAnimationTarget<Traits extends object = NodeTraits>(
  nodes: readonly (Node<Traits> | null)[],
  orderList: NodeOrderList<Traits>,
): Skeleton2DDrawOrderAnimationTarget<Traits> {
  const out = allocateEntity<Skeleton2DDrawOrderAnimationTarget<Traits>>();
  out.kind = TargetKind.DrawOrder;
  out.nodes = nodes;
  out.orderList = orderList;
  return finishEntity(out);
}

/**
 * Turns an import's draw-order timeline into the channel that drives it — the **scene-side step** the
 * data on `Skeleton2DImport` is waiting for.
 *
 * A target names what the file states, and a draw-order target names display nodes and a
 * `NodeOrderList`, neither of which exists at parse time. So the parser reports orderings and this binds
 * them once there are nodes: the same division `@flighthq/scene2d-formats` uses for Rive, where the
 * codec reports `DrawRules` and the caller wires the `NodeOrderList`.
 *
 * The track is built as `Step` because it already holds whole orderings — interpolating two of them
 * would produce fractional sort keys and a sequence nobody authored. Building it as `Step` here means
 * the binder's coercion guard has nothing to report, which is the point: the honest shape does not need
 * the warning.
 *
 * Returns `null` for a timeline with no keyframes, and for one whose `orderings` is not a whole number
 * of per-keyframe orderings — a partial final ordering would silently drop the slots past its end.
 */
export function createSkeleton2DDrawOrderChannel<Traits extends object = NodeTraits>(
  timeline: Readonly<Skeleton2DDrawOrderTimeline>,
  nodes: readonly (Node<Traits> | null)[],
  orderList: NodeOrderList<Traits>,
): AnimationChannel | null {
  const keyframes = timeline.times.length;
  if (keyframes === 0) return null;
  const slotCount = timeline.orderings.length / keyframes;
  if (!Number.isInteger(slotCount) || slotCount === 0) return null;

  return createAnimationChannel(
    createAnimationTrack({
      components: slotCount,
      interpolation: STEP_INTERPOLATION,
      times: timeline.times,
      values: timeline.orderings,
    }),
    createSkeleton2DDrawOrderAnimationTarget(nodes, orderList),
  );
}

/**
 * Claims the draw-order kind for its binder.
 *
 * Bone and slot channels bind without this because posing a rig from a clip is what the package IS;
 * draw order registers explicitly and shakes out when unused, which is the part the registry buys — a
 * rig that never reorders its drawing pays for neither this binder nor its `@flighthq/node` edge.
 */
export function registerSkeleton2DDrawOrderAnimationBinder(): void {
  registerSkeleton2DAnimationTargetBinder(TargetKind.DrawOrder, bindSkeleton2DDrawOrderChannel);
}

export function unregisterSkeleton2DDrawOrderAnimationBinder(): void {
  unregisterSkeleton2DAnimationTargetBinder(TargetKind.DrawOrder);
}

/**
 * Writes one keyframe's ordering into the target's list.
 *
 * The track holds a FULL ordering per keyframe — `components` is the slot count and each slot's value is
 * its sort key — rather than the (slot, offset) pairs Spine states on the wire, because an offset list is
 * only meaningful applied in sequence to a prior order, and a track has to answer "what is in effect at
 * time t" from one keyframe alone.
 *
 * It is a STEP walk whatever the track claims, for the same reason an attachment index is: interpolating
 * two orderings yields fractional sort keys and a sequence nobody authored. Correct, and reported through
 * `enableSkeleton2DGuards` rather than performed in silence.
 *
 * The list is rebuilt rather than patched, which keeps the pass O(slots) and allocation-free after the
 * first frame — `addNodeOrderListEntry` reuses the backing arrays, while setting entries individually
 * would search the list once per slot.
 */
function bindSkeleton2DDrawOrderChannel(
  channel: Readonly<AnimationChannel>,
  _setup: unknown,
  _pose: unknown,
  target: unknown,
  time: number,
): void {
  const drawTarget = target as Readonly<Skeleton2DDrawOrderAnimationTarget>;
  const nodes = drawTarget.nodes;
  const orderList = drawTarget.orderList;
  if (nodes === undefined || nodes === null || orderList === undefined || orderList === null) return;

  const track = channel.track;
  const components = track.components;
  if (components === 0) return;
  const keyframe = findSkeleton2DStepKeyframe(track.times, time);
  if (keyframe < 0) return;
  if (track.interpolation !== STEP_INTERPOLATION) {
    reportSkeleton2DCoercedInterpolation(DRAW_ORDER_SUBJECT, track.interpolation, STEP_INTERPOLATION);
  }

  clearNodeOrderList(orderList);
  const base = keyframe * components;
  const count = components < nodes.length ? components : nodes.length;
  for (let slot = 0; slot < count; slot++) {
    const node = nodes[slot];
    // A slot that draws nothing contributes no entry rather than a placeholder, so the list stays a
    // permutation of the nodes that actually exist.
    if (node === null || node === undefined) continue;
    addNodeOrderListEntry(orderList, node, track.values[base + slot]);
  }
}

const DRAW_ORDER_SUBJECT = 'DrawOrder';
const STEP_INTERPOLATION = 'Step';
