/**
 * A rig's draw-order timeline as the file states it, carried on the import rather than as a channel.
 *
 * **A target names what the file states.** A draw-order channel's target needs a `NodeOrderList` and a
 * slot-index-to-display-node table, and neither is rig data — nodes do not exist until a caller builds
 * a scene. So the parser reports the orderings here and a scene-side step turns them into channels once
 * there are nodes to name, which is the same division `@flighthq/scene2d-formats` already uses for Rive:
 * the codec reports `DrawRules` and the caller wires the `NodeOrderList`.
 *
 * `orderings` holds **one full ordering per keyframe**, flat, in keyframe order — `slotCount` sort keys
 * per keyframe, where the value at a slot's offset is that slot's draw position on that frame. Spine
 * states the wire form as (slot, offset) pairs applied in sequence to the previous order, which cannot
 * answer "what is in effect at time t" from one keyframe alone; resolving those pairs into whole
 * orderings is the parser's job, so a consumer reads a self-contained frame.
 *
 * `slotCount` is `orderings.length / times.length` and is not stored separately, so the two cannot
 * disagree.
 */
export interface Skeleton2DDrawOrderTimeline {
  orderings: number[];
  /** Seconds, one per keyframe, ascending. */
  times: number[];
}
