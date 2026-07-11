import type { AnimationChannel, AnimationClip, AnimationTrack } from '@flighthq/types';

import { cloneAnimationTrack, sampleAnimationTrack } from './animationTrack';

// Deep-copies a clip: each channel gets a freshly cloned track (buffers deep-copied) while its opaque
// `targetRef` is carried by reference (the clip core never interprets it, so it cannot deep-copy it).
export function cloneAnimationClip(clip: Readonly<AnimationClip>): AnimationClip {
  const channels: AnimationChannel[] = [];
  for (const channel of clip.channels) {
    channels.push(createAnimationChannel(cloneAnimationTrack(channel.track), channel.targetRef));
  }
  return { channels, duration: clip.duration };
}

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

// Samples every channel of `clip` at `time`, reusing the caller-supplied `out` scratch buffer for each
// channel and handing it to `visit` along with the channel and its index — so a domain layer (scene,
// skeleton) can bind each sampled value to that channel's target through one shared loop instead of
// re-implementing the per-channel walk. `out` must be at least as wide as the widest channel's
// `components`; it is overwritten per channel, so `visit` must consume it before returning. Alloc-free.
export function sampleAnimationClip(
  out: number[] | Float32Array,
  clip: Readonly<AnimationClip>,
  time: number,
  visit: (sampled: Readonly<number[] | Float32Array>, channel: Readonly<AnimationChannel>, index: number) => void,
): void {
  const channels = clip.channels;
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    sampleAnimationTrack(out, channel.track, time);
    visit(out, channel, i);
  }
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
