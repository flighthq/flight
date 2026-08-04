import type { AnimationChannel } from './AnimationChannel';
import type { Skeleton2D } from './Skeleton2D';

/**
 * What one target kind does with a channel. `applyAnimationClipToSkeleton2D` looks the channel's target
 * kind up in the binder registry and hands the whole channel over, so a family this package does not own
 * poses through the same single pass as bones and slots.
 *
 * `target` is the channel's `targetRef`, already known to carry the kind the binder registered for; a
 * binder casts it to its own target type. `setup` is the immutable rest pose and `pose` is what gets
 * written — they are never the same object. A binder that cannot use what it is given returns without
 * writing, because a channel it cannot honor is an expected condition rather than an error.
 */
export type Skeleton2DAnimationTargetBinder = (
  channel: Readonly<AnimationChannel>,
  setup: Readonly<Skeleton2D>,
  pose: Skeleton2D,
  target: unknown,
  time: number,
) => void;
