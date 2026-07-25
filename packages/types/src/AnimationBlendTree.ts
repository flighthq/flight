import type { AnimationChannel } from './AnimationChannel';
import type { AnimationPlayer } from './AnimationPlayer';
import type { AnimationSampleAccumulator } from './AnimationSampleAccumulator';
import type { Entity } from './Entity';

// One weighted leaf in an AnimationBlendTree. Override leaves contribute to a normalized N-way pose;
// additive leaves are applied afterward as weighted deltas. The player remains caller-visible and may
// be shared with another tree; advancement de-duplicates shared player identity within one tree.
export interface AnimationBlendTreeInput extends Entity {
  additive: boolean;
  player: AnimationPlayer;
  weight: number;
}

// One input/channel pair contributing to a target in the tree's precomputed correspondence layout.
export interface AnimationBlendTreeChannelSource {
  channelIndex: number;
  inputIndex: number;
}

// All leaf sources that animate one opaque targetRef. Compatible component widths and quaternion flags
// are enforced when the tree is created. The accumulator is owned reusable sampling state.
export interface AnimationBlendTreeChannel {
  accumulator: AnimationSampleAccumulator;
  channel: Readonly<AnimationChannel>;
  sources: readonly Readonly<AnimationBlendTreeChannelSource>[];
}

// Explicit N-way animation blend state. Sampling normalizes all positive-weight override leaves for each
// target, then composes positive-weight additive leaves in stable input order. Scratch is allocated once.
export interface AnimationBlendTree extends Entity {
  channels: readonly Readonly<AnimationBlendTreeChannel>[];
  inputs: readonly AnimationBlendTreeInput[];
  sampleScratch: Float32Array;
}
