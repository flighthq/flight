import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AnimationBlendTree,
  AnimationChannel,
  AnimationLayer,
  AnimationLayerOptions,
  AnimationLayerStack,
  AnimationLayerStackChannel,
  AnimationLayerStackChannelSource,
  AnimationStateMachine,
  EntityConstruction,
} from '@flighthq/types/contract';

import { advanceAnimationPlayers } from './animationAdvance';
import { addAnimationSample, blendAnimationSamples } from './animationBlend';
import { sampleAnimationBlendTreeChannel } from './animationBlendTree';
import { sampleAnimationStateMachineChannel } from './animationStateMachine';
import { advanceAnimationStateMachineWithScratch } from './animationStateMachineAdvance';

// Advances every layer source while de-duplicating shared player identity across the complete stack.
export function advanceAnimationLayerStack(stack: AnimationLayerStack, dt: number): void {
  const advanced = stack.advanceScratch;
  advanced.length = 0;
  for (const tree of stack.blendTrees) advanceAnimationPlayers(tree.players, dt, advanced);
  for (const machine of stack.stateMachines) advanceAnimationStateMachineWithScratch(machine, dt, advanced);
}

// Allocates a layer sourced by one blend tree. An omitted channel subset selects the complete tree.
export function createAnimationBlendTreeLayer(
  blendTree: AnimationBlendTree,
  options?: Readonly<AnimationLayerOptions>,
): AnimationLayer {
  return createAnimationLayer(blendTree.channels.length, blendTree, null, options);
}

// Allocates an ordered stack with target correspondence across the selected channels of every layer.
export function createAnimationLayerStack(layers: readonly AnimationLayer[]): AnimationLayerStack {
  const copiedLayers = layers.slice();
  const blendTrees: AnimationBlendTree[] = [];
  const channels: AnimationLayerStackChannel[] = [];
  const channelByTarget = new Map<unknown, number>();
  const stateMachines: AnimationStateMachine[] = [];
  let sampleWidth = 0;

  for (let layerIndex = 0; layerIndex < copiedLayers.length; layerIndex++) {
    const layer = copiedLayers[layerIndex];
    if (layer.blendTree !== null) {
      if (!blendTrees.includes(layer.blendTree)) blendTrees.push(layer.blendTree);
    } else if (!stateMachines.includes(layer.stateMachine!)) {
      stateMachines.push(layer.stateMachine!);
    }
    const sourceChannels = getAnimationLayerChannels(layer);
    const channelIndices = layer.channelIndices ?? sourceChannels.map((_, index) => index);
    for (const channelIndex of channelIndices) {
      const channel = sourceChannels[channelIndex].channel;
      sampleWidth = Math.max(sampleWidth, channel.track.components);
      const existingIndex = channelByTarget.get(channel.targetRef);
      if (existingIndex === undefined) {
        channelByTarget.set(channel.targetRef, channels.length);
        channels.push({ channel, sources: [{ channelIndex, layerIndex }] });
        continue;
      }
      const existing = channels[existingIndex];
      assertCompatibleAnimationLayerChannels(existing.channel, channel);
      (existing.sources as AnimationLayerStackChannelSource[]).push({ channelIndex, layerIndex });
    }
  }

  const out = allocateEntity<AnimationLayer>();
  out.advanceScratch = [];
  out.blendTrees = blendTrees;
  out.channels = channels;
  out.layers = copiedLayers;
  out.sampleScratch = new Float32Array(sampleWidth);
  out.stateMachines = stateMachines;
  return finishEntity(out);
}

// Allocates a layer sourced by one named state machine. Its global target layout remains stable while
// the current state and transition change, so channel masks need no runtime rebuild.
export function createAnimationStateMachineLayer(
  stateMachine: AnimationStateMachine,
  options?: Readonly<AnimationLayerOptions>,
): AnimationLayer {
  return createAnimationLayer(stateMachine.channels.length, null, stateMachine, options);
}

// Samples all composed targets in stable first-appearance order. The visitor must consume `out`
// before returning because it is overwritten for the next target.
export function sampleAnimationLayerStack(
  out: number[] | Float32Array,
  stack: Readonly<AnimationLayerStack>,
  visit: (sampled: Readonly<number[] | Float32Array>, channel: Readonly<AnimationChannel>, index: number) => void,
): void {
  for (let index = 0; index < stack.channels.length; index++) {
    if (sampleAnimationLayerStackChannel(out, stack, index)) visit(out, stack.channels[index].channel, index);
  }
}

// Samples one globally matched target. Override layers blend in order; additive layers compose weighted
// deltas. The first present override passes through because the target-free core owns no default pose.
export function sampleAnimationLayerStackChannel(
  out: number[] | Float32Array,
  stack: Readonly<AnimationLayerStack>,
  channelIndex: number,
): boolean {
  const entry = stack.channels[channelIndex];
  if (entry === undefined) return false;
  let hasPose = false;

  for (const source of entry.sources) {
    const layer = stack.layers[source.layerIndex];
    if (!(layer.weight > 0) || !sampleAnimationLayer(stack.sampleScratch, layer, source.channelIndex)) continue;
    if (layer.additive) {
      if (!hasPose) {
        writeAnimationLayerIdentity(out, entry.channel.track.components, entry.channel.track.quaternion);
        hasPose = true;
      }
      addAnimationSample(out, out, stack.sampleScratch, layer.weight, entry.channel.track.quaternion);
    } else if (hasPose) {
      blendAnimationSamples(out, out, stack.sampleScratch, layer.weight, entry.channel.track.quaternion);
    } else {
      copyAnimationLayerSample(out, stack.sampleScratch, entry.channel.track.components);
      hasPose = true;
    }
  }
  return hasPose;
}

// Updates a layer weight by index. Returns false for an absent index, leaving the stack unchanged.
export function setAnimationLayerWeight(stack: AnimationLayerStack, layerIndex: number, weight: number): boolean {
  const layer = stack.layers[layerIndex];
  if (layer === undefined) return false;
  layer.weight = weight;
  return true;
}

function assertCompatibleAnimationLayerChannels(
  existing: Readonly<AnimationChannel>,
  channel: Readonly<AnimationChannel>,
): void {
  if (
    existing.track.components !== channel.track.components ||
    existing.track.quaternion !== channel.track.quaternion
  ) {
    throw new TypeError('AnimationLayerStack target has incompatible tracks across layers.');
  }
}

function copyAnimationLayerSample(out: number[] | Float32Array, sample: ArrayLike<number>, components: number): void {
  const width = Math.min(out.length, sample.length, components);
  for (let component = 0; component < width; component++) out[component] = sample[component];
}

function createAnimationLayer(
  channelCount: number,
  blendTree: AnimationBlendTree | null,
  stateMachine: AnimationStateMachine | null,
  options?: Readonly<AnimationLayerOptions>,
): AnimationLayer {
  const out = allocateEntity<AnimationLayer>();
  out.additive = options?.additive ?? false;
  out.blendTree = blendTree;
  out.channelIndices = copyAnimationLayerChannelIndices(options?.channelIndices, channelCount);
  out.stateMachine = stateMachine;
  out.weight = options?.weight ?? 1;
  return finishEntity(out);
}

function copyAnimationLayerChannelIndices(
  channelIndices: readonly number[] | undefined,
  channelCount: number,
): readonly number[] | null {
  if (channelIndices === undefined) return null;
  const copied = channelIndices.slice().sort((a, b) => a - b);
  for (let index = 0; index < copied.length; index++) {
    const channelIndex = copied[index];
    if (!Number.isInteger(channelIndex) || channelIndex < 0 || channelIndex >= channelCount) {
      throw new RangeError(`AnimationLayer channel index ${String(channelIndex)} does not exist.`);
    }
    if (index > 0 && copied[index - 1] === channelIndex) {
      throw new TypeError(`AnimationLayer channel index ${channelIndex} is duplicated.`);
    }
  }
  return copied;
}

function getAnimationLayerChannels(
  layer: Readonly<AnimationLayer>,
): readonly Readonly<{ channel: Readonly<AnimationChannel> }>[] {
  return layer.blendTree?.channels ?? layer.stateMachine!.channels;
}

function sampleAnimationLayer(
  out: number[] | Float32Array,
  layer: Readonly<AnimationLayer>,
  channelIndex: number,
): boolean {
  if (layer.blendTree !== null) return sampleAnimationBlendTreeChannel(out, layer.blendTree, channelIndex);
  return sampleAnimationStateMachineChannel(out, layer.stateMachine!, channelIndex);
}

function writeAnimationLayerIdentity(out: number[] | Float32Array, components: number, quaternion: boolean): void {
  const width = Math.min(out.length, components);
  for (let component = 0; component < width; component++) out[component] = 0;
  if (quaternion && width >= 4) out[3] = 1;
}
