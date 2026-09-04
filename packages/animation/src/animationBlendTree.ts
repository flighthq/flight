import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AnimationBlendTree,
  AnimationBlendTreeChannel,
  AnimationBlendTreeChannelSource,
  AnimationBlendTreeInput,
  AnimationChannel,
  AnimationPlayer,
  EntityConstruction,
} from '@flighthq/types/contract';

import {
  accumulateAnimationSample,
  addAnimationSample,
  createAnimationSampleAccumulator,
  finishAnimationSample,
  resetAnimationSampleAccumulator,
} from './animationBlend';
import { advanceAnimationPlayer } from './animationPlayer';
import { sampleAnimationTrack } from './animationTrack';

// Advances each distinct player referenced by the tree exactly once. Leaves sharing a player can weight
// it differently without multiplying playhead speed.
export function advanceAnimationBlendTree(tree: AnimationBlendTree, dt: number): void {
  for (const player of tree.players) advanceAnimationPlayer(player, dt);
}

// Allocates an N-way target-correspondence layout and one reusable accumulator per target. Every clip
// must contain unique targetRef values; corresponding tracks must agree on width and quaternion meaning.
export function createAnimationBlendTree(inputs: readonly AnimationBlendTreeInput[]): AnimationBlendTree {
  const copiedInputs = inputs.slice();
  const channels: AnimationBlendTreeChannel[] = [];
  const channelByTarget = new Map<unknown, number>();
  const players: AnimationPlayer[] = [];
  let sampleWidth = 0;

  for (let inputIndex = 0; inputIndex < copiedInputs.length; inputIndex++) {
    const player = copiedInputs[inputIndex].player;
    if (!players.includes(player)) players.push(player);
    const inputChannels = copiedInputs[inputIndex].player.clip.channels;
    assertUniqueAnimationBlendTreeTargets(inputChannels, inputIndex);
    for (let channelIndex = 0; channelIndex < inputChannels.length; channelIndex++) {
      const channel = inputChannels[channelIndex];
      sampleWidth = Math.max(sampleWidth, channel.track.components);
      const existingIndex = channelByTarget.get(channel.targetRef);
      if (existingIndex === undefined) {
        channelByTarget.set(channel.targetRef, channels.length);
        channels.push({
          accumulator: createAnimationSampleAccumulator(channel.track.components, channel.track.quaternion),
          channel,
          sources: [{ channelIndex, inputIndex }],
        });
        continue;
      }
      const existing = channels[existingIndex];
      assertCompatibleAnimationBlendTreeChannels(existing.channel, channel);
      (existing.sources as AnimationBlendTreeChannelSource[]).push({ channelIndex, inputIndex });
    }
  }

  const out = allocateEntity<AnimationBlendTree>();
  out.channels = channels;
  out.inputs = copiedInputs;
  out.players = players;
  out.sampleScratch = new Float32Array(sampleWidth);
  return finishEntity(out);
}

// Allocates one caller-visible leaf descriptor. Weight is not clamped; sampling ignores values that are
// not positive, so callers can drive weights directly from math without a separate sanitation pass.
export function createAnimationBlendTreeInput(
  player: AnimationPlayer,
  weight = 1,
  additive = false,
): AnimationBlendTreeInput {
  const out = allocateEntity<AnimationBlendTree>();
  out.additive = additive;
  out.player = player;
  out.weight = weight;
  return finishEntity(out);
}

// Samples every target in stable first-appearance order. The visitor must consume `out` before returning
// because it is overwritten for the next target. Targets with no positive-weight leaf are skipped.
export function sampleAnimationBlendTree(
  out: number[] | Float32Array,
  tree: Readonly<AnimationBlendTree>,
  visit: (sampled: Readonly<number[] | Float32Array>, channel: Readonly<AnimationChannel>, index: number) => void,
): void {
  for (let index = 0; index < tree.channels.length; index++) {
    if (sampleAnimationBlendTreeChannel(out, tree, index)) visit(out, tree.channels[index].channel, index);
  }
}

// Samples one precomputed target channel. Override leaves use normalized weighted accumulation; additive
// leaves then compose weighted deltas in input order. Returns false without changing `out` when empty.
export function sampleAnimationBlendTreeChannel(
  out: number[] | Float32Array,
  tree: Readonly<AnimationBlendTree>,
  channelIndex: number,
): boolean {
  const entry = tree.channels[channelIndex];
  if (entry === undefined) return false;
  const accumulator = entry.accumulator;
  resetAnimationSampleAccumulator(accumulator);
  let hasAdditive = false;

  for (const source of entry.sources) {
    const input = tree.inputs[source.inputIndex];
    if (input.additive || !(input.weight > 0)) {
      if (input.additive && input.weight > 0) hasAdditive = true;
      continue;
    }
    const channel = input.player.clip.channels[source.channelIndex];
    sampleAnimationTrack(tree.sampleScratch, channel.track, input.player.time);
    accumulateAnimationSample(accumulator, tree.sampleScratch, input.weight);
  }

  const hasOverride = finishAnimationSample(out, accumulator);
  if (!hasOverride && !hasAdditive) return false;
  if (!hasOverride)
    writeAnimationBlendTreeIdentity(out, entry.channel.track.components, entry.channel.track.quaternion);

  for (const source of entry.sources) {
    const input = tree.inputs[source.inputIndex];
    if (!input.additive || !(input.weight > 0)) continue;
    const channel = input.player.clip.channels[source.channelIndex];
    sampleAnimationTrack(tree.sampleScratch, channel.track, input.player.time);
    addAnimationSample(out, out, tree.sampleScratch, input.weight, channel.track.quaternion);
  }
  return true;
}

// Updates a leaf weight by index. Returns false for an absent index, leaving the tree unchanged.
export function setAnimationBlendTreeInputWeight(
  tree: AnimationBlendTree,
  inputIndex: number,
  weight: number,
): boolean {
  const input = tree.inputs[inputIndex];
  if (input === undefined) return false;
  input.weight = weight;
  return true;
}

function assertCompatibleAnimationBlendTreeChannels(
  existing: Readonly<AnimationChannel>,
  channel: Readonly<AnimationChannel>,
): void {
  if (existing.track.components !== channel.track.components) {
    throw new RangeError(
      `AnimationBlendTree target has different component widths (${existing.track.components} and ${channel.track.components}).`,
    );
  }
  if (existing.track.quaternion !== channel.track.quaternion) {
    throw new TypeError('AnimationBlendTree target has incompatible quaternion flags.');
  }
}

function assertUniqueAnimationBlendTreeTargets(
  channels: readonly Readonly<AnimationChannel>[],
  inputIndex: number,
): void {
  const targets = new Set<unknown>();
  for (const channel of channels) {
    if (targets.has(channel.targetRef)) {
      throw new TypeError(`AnimationBlendTree input ${inputIndex} clip contains a duplicate targetRef.`);
    }
    targets.add(channel.targetRef);
  }
}

function writeAnimationBlendTreeIdentity(out: number[] | Float32Array, components: number, quaternion: boolean): void {
  const width = Math.min(out.length, components);
  for (let component = 0; component < width; component++) out[component] = 0;
  if (quaternion && width >= 4) out[3] = 1;
}
