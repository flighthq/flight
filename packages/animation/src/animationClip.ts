import type { AnimationChannel, AnimationClip, AnimationTrack } from '@flighthq/types';

// Pairs a track with an opaque target reference (interpreted only by the domain binding layer).
export function createAnimationChannel(track: AnimationTrack, targetRef: unknown): AnimationChannel {
  return { targetRef, track };
}

// Bundles channels into a clip. `duration` defaults to the latest keyframe time across all channels.
export function createAnimationClip(channels: AnimationChannel[], duration?: number): AnimationClip {
  return { channels, duration: duration ?? computeChannelsDuration(channels) };
}

// Returns the clip's total duration in seconds.
export function getAnimationClipDuration(clip: Readonly<AnimationClip>): number {
  return clip.duration;
}

function computeChannelsDuration(channels: readonly Readonly<AnimationChannel>[]): number {
  let max = 0;
  for (const channel of channels) {
    const times = channel.track.times;
    const last = times.length;
    if (last > 0 && times[last - 1] > max) max = times[last - 1];
  }
  return max;
}
