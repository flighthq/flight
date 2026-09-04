import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AnimationChannel,
  AnimationCrossfade,
  AnimationCrossfadeChannel,
  AnimationCrossfadeOptions,
  AnimationPlayer,
  EntityConstruction,
} from '@flighthq/types/contract';

import { blendAnimationSamples } from './animationBlend';
import { advanceAnimationPlayer } from './animationPlayer';
import { sampleAnimationTrack } from './animationTrack';

// Advances both source players by the same delta and updates the transition weight. Nothing advances
// implicitly; callers drive this alongside their other animation state.
export function advanceAnimationCrossfade(state: AnimationCrossfade, dt: number): void {
  advanceAnimationPlayer(state.from, dt);
  advanceAnimationPlayer(state.to, dt);
  state.elapsed += dt;
  state.weight = state.curve(getLinearAnimationCrossfadeWeight(state.elapsed, state.duration));
}

export function createAnimationCrossfade(
  from: AnimationPlayer,
  to: AnimationPlayer,
  duration: number,
  opts?: Readonly<AnimationCrossfadeOptions>,
): AnimationCrossfade {
  const out = allocateEntity<AnimationCrossfade>();
  initializeAnimationCrossfade(out, from, to, duration, opts);
  return finishEntity(out);
}

// Allocates a two-player transition, target-correspondence layout, and reusable sample scratch.
// Channels correspond when their opaque targetRef values have identity equality. A target present in
// only one clip remains in the layout as a pass-through channel.
export function initializeAnimationCrossfade(
  out: EntityConstruction<AnimationCrossfade>,
  from: AnimationPlayer,
  to: AnimationPlayer,
  duration: number,
  opts?: Readonly<AnimationCrossfadeOptions>,
): void {
  const resolvedDuration = Math.max(0, duration);
  const curve = opts?.curve ?? linearAnimationCrossfadeCurve;
  const channels = createAnimationCrossfadeChannels(from, to);
  let sampleWidth = 0;
  for (const entry of channels) sampleWidth = Math.max(sampleWidth, entry.channel.track.components);
  out.channels = channels;
  out.curve = curve;
  out.duration = resolvedDuration;
  out.elapsed = 0;
  out.from = from;
  out.fromSample = new Float32Array(sampleWidth);
  out.to = to;
  out.toSample = new Float32Array(sampleWidth);
  out.weight = curve(getLinearAnimationCrossfadeWeight(0, resolvedDuration));
}

// Reports when elapsed transition time has reached duration. Completion deliberately ignores the
// curved weight because back/elastic easing may overshoot 1 before the lifecycle duration ends. The
// caller owns retirement/removal of a completed transition; the controller has no hidden scheduler.
export function isAnimationCrossfadeComplete(state: Readonly<AnimationCrossfade>): boolean {
  return state.duration <= 0 || state.elapsed >= state.duration;
}

// Samples every target correspondence using the caller-supplied per-channel scratch and visitor,
// mirroring sampleAnimationClip. Matched targets blend by the destination weight; one-sided targets
// pass their existing clip value through unchanged. The visitor must consume `out` before returning
// because the same buffer is overwritten for the next channel. Allocation-free after construction.
export function sampleAnimationCrossfade(
  out: number[] | Float32Array,
  state: Readonly<AnimationCrossfade>,
  visit: (sampled: Readonly<number[] | Float32Array>, channel: Readonly<AnimationChannel>, index: number) => void,
): void {
  const fromChannels = state.from.clip.channels;
  const toChannels = state.to.clip.channels;
  for (let index = 0; index < state.channels.length; index++) {
    const entry = state.channels[index];
    if (entry.fromIndex === null) {
      sampleAnimationTrack(out, toChannels[entry.toIndex!].track, state.to.time);
    } else if (entry.toIndex === null) {
      sampleAnimationTrack(out, fromChannels[entry.fromIndex].track, state.from.time);
    } else {
      const fromTrack = fromChannels[entry.fromIndex].track;
      const toTrack = toChannels[entry.toIndex].track;
      sampleAnimationTrack(state.fromSample, fromTrack, state.from.time);
      sampleAnimationTrack(state.toSample, toTrack, state.to.time);
      blendAnimationSamples(out, state.fromSample, state.toSample, state.weight, fromTrack.quaternion);
    }
    visit(out, entry.channel, index);
  }
}

function createAnimationCrossfadeChannels(
  from: Readonly<AnimationPlayer>,
  to: Readonly<AnimationPlayer>,
): AnimationCrossfadeChannel[] {
  const fromChannels = from.clip.channels;
  const toChannels = to.clip.channels;
  assertUniqueAnimationCrossfadeTargets(fromChannels, 'source');
  assertUniqueAnimationCrossfadeTargets(toChannels, 'destination');
  const toByTarget = new Map<unknown, number>();
  for (let index = 0; index < toChannels.length; index++) {
    if (!toByTarget.has(toChannels[index].targetRef)) toByTarget.set(toChannels[index].targetRef, index);
  }

  const channels: AnimationCrossfadeChannel[] = [];
  const matchedTo = new Set<number>();
  for (let fromIndex = 0; fromIndex < fromChannels.length; fromIndex++) {
    const fromChannel = fromChannels[fromIndex];
    const toIndex = toByTarget.get(fromChannel.targetRef);
    if (toIndex === undefined) {
      channels.push({ channel: fromChannel, fromIndex, toIndex: null });
      continue;
    }
    const toChannel = toChannels[toIndex];
    if (fromChannel.track.components !== toChannel.track.components) {
      throw new RangeError(
        `AnimationCrossfade target has different component widths (${fromChannel.track.components} and ${toChannel.track.components}).`,
      );
    }
    if (fromChannel.track.quaternion !== toChannel.track.quaternion) {
      throw new TypeError('AnimationCrossfade target has incompatible quaternion flags.');
    }
    channels.push({ channel: toChannel, fromIndex, toIndex });
    matchedTo.add(toIndex);
  }
  for (let toIndex = 0; toIndex < toChannels.length; toIndex++) {
    if (!matchedTo.has(toIndex)) {
      channels.push({ channel: toChannels[toIndex], fromIndex: null, toIndex });
    }
  }
  return channels;
}

function assertUniqueAnimationCrossfadeTargets(
  channels: readonly Readonly<AnimationChannel>[],
  clipLabel: string,
): void {
  const targets = new Set<unknown>();
  for (const channel of channels) {
    if (targets.has(channel.targetRef)) {
      throw new TypeError(`AnimationCrossfade ${clipLabel} clip contains a duplicate targetRef.`);
    }
    targets.add(channel.targetRef);
  }
}

function getLinearAnimationCrossfadeWeight(elapsed: number, duration: number): number {
  if (duration <= 0) return 1;
  const normalized = elapsed / duration;
  return normalized < 0 ? 0 : normalized > 1 ? 1 : normalized;
}

function linearAnimationCrossfadeCurve(t: number): number {
  return t;
}
