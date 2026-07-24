import type { AnimationChannel } from './AnimationChannel';
import type { AnimationPlayer } from './AnimationPlayer';
import type { EasingFunction } from './EasingFunction';
import type { Entity } from './Entity';

// One precomputed target correspondence in a crossfade. A null side means that target exists in only
// one clip and its sampled value passes through unchanged.
export interface AnimationCrossfadeChannel {
  channel: Readonly<AnimationChannel>;
  fromIndex: number | null;
  toIndex: number | null;
}

// Construction options for an AnimationCrossfade. `curve` reshapes the normalized transition time;
// it is a plain function value so the animation package does not depend on a particular easing
// library. The default is linear.
export interface AnimationCrossfadeOptions {
  curve?: EasingFunction;
}

// An explicit two-player transition. Both players remain caller-visible and are advanced together by
// advanceAnimationCrossfade. `weight` is the curved blend weight of `to`; it may overshoot 1 when the
// curve does, while lifecycle completion is based on elapsed time reaching duration. `channels` is the
// target-correspondence layout computed at construction. The sample buffers are owned scratch storage,
// sized once so sampling stays allocation-free.
export interface AnimationCrossfade extends Entity {
  channels: readonly Readonly<AnimationCrossfadeChannel>[];
  curve: EasingFunction;
  duration: number;
  elapsed: number;
  from: AnimationPlayer;
  fromSample: Float32Array;
  to: AnimationPlayer;
  toSample: Float32Array;
  weight: number;
}
