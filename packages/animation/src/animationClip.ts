import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AnimationChannel,
  AnimationClip,
  AnimationClipEvent,
  AnimationTrack,
  EntityConstruction,
} from '@flighthq/types/contract';

import { cloneAnimationTrack, sampleAnimationTrack } from './animationTrack';

// Deep-copies a clip: each channel gets a freshly cloned track (buffers deep-copied) while its opaque
// `targetRef` is carried by reference (the clip core never interprets it, so it cannot deep-copy it).
export function cloneAnimationClip(clip: Readonly<AnimationClip>): AnimationClip {
  const channels: AnimationChannel[] = [];
  for (const channel of clip.channels) {
    channels.push(createAnimationChannel(cloneAnimationTrack(channel.track), channel.targetRef));
  }
  const events = clip.events.map((event) => createAnimationClipEvent(event.time, event.name, event.payload));
  const out = allocateEntity<AnimationClip>();
  out.channels = channels;
  out.duration = clip.duration;
  out.events = events;
  return finishEntity(out);
}

// Pairs a track with an opaque target reference (interpreted only by the domain binding layer).
export function createAnimationChannel(track: AnimationTrack, targetRef: unknown): AnimationChannel {
  const out = allocateEntity<AnimationChannel>();
  out.targetRef = targetRef;
  out.track = track;
  return finishEntity(out);
}

// Bundles channels and sorted clip events. `duration` defaults to the latest keyframe or event time.
// Explicit duration must include every event so no marker is silently unreachable.
export function createAnimationClip(
  channels: AnimationChannel[],
  duration?: number,
  events: readonly AnimationClipEvent[] = [],
): AnimationClip {
  const copiedEvents = events.slice().sort((a, b) => a.time - b.time);
  validateAnimationClipEvents(copiedEvents);
  const computedDuration = Math.max(
    computeChannelsDuration(channels),
    computeAnimationClipEventsDuration(copiedEvents),
  );
  if (duration !== undefined && copiedEvents.length > 0 && copiedEvents[copiedEvents.length - 1].time > duration) {
    throw new RangeError('AnimationClip event time exceeds the explicit clip duration.');
  }
  const out = allocateEntity<AnimationClip>();
  out.channels = channels;
  out.duration = duration ?? computedDuration;
  out.events = copiedEvents;
  return finishEntity(out);
}

// Allocates one opaque-payload clip marker. Clip construction validates its time against the clip.
export function createAnimationClipEvent(time: number, name: string, payload: unknown = null): AnimationClipEvent {
  const out = allocateEntity<AnimationClipEvent>();
  out.name = name;
  out.payload = payload;
  out.time = time;
  return finishEntity(out);
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

function computeAnimationClipEventsDuration(events: readonly Readonly<AnimationClipEvent>[]): number {
  return events.length > 0 ? events[events.length - 1].time : 0;
}

function validateAnimationClipEvents(events: readonly Readonly<AnimationClipEvent>[]): void {
  for (const event of events) {
    if (!Number.isFinite(event.time) || event.time < 0) {
      throw new RangeError(`AnimationClip event "${event.name}" time must be a finite non-negative number.`);
    }
  }
}
