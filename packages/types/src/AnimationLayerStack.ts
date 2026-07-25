import type { AnimationBlendTree } from './AnimationBlendTree';
import type { AnimationChannel } from './AnimationChannel';
import type { AnimationPlayer } from './AnimationPlayer';
import type { AnimationStateMachine } from './AnimationStateMachine';
import type { Entity } from './Entity';

export interface AnimationLayerOptions {
  additive?: boolean;
  channelIndices?: readonly number[];
  weight?: number;
}

// One ordered pose layer. Exactly one source field is non-null. `channelIndices` is null for every
// source channel, or a validated subset in source-channel order. Override layers blend toward their
// pose; additive layers compose weighted deltas after the pose accumulated below them.
export interface AnimationLayer extends Entity {
  additive: boolean;
  blendTree: AnimationBlendTree | null;
  channelIndices: readonly number[] | null;
  stateMachine: AnimationStateMachine | null;
  weight: number;
}

// One layer/channel pair contributing to a globally target-matched stack channel.
export interface AnimationLayerStackChannelSource {
  channelIndex: number;
  layerIndex: number;
}

// All ordered layer sources that affect one opaque targetRef.
export interface AnimationLayerStackChannel {
  channel: Readonly<AnimationChannel>;
  sources: readonly Readonly<AnimationLayerStackChannelSource>[];
}

// Ordered target-free layer composition with a precomputed correspondence layout and reusable sample
// scratch. The first present override pose passes through; higher overrides blend by their layer weight.
export interface AnimationLayerStack extends Entity {
  advanceScratch: AnimationPlayer[];
  blendTrees: readonly AnimationBlendTree[];
  channels: readonly Readonly<AnimationLayerStackChannel>[];
  layers: readonly AnimationLayer[];
  sampleScratch: Float32Array;
  stateMachines: readonly AnimationStateMachine[];
}
