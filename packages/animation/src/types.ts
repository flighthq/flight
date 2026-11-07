import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

// The runtime-slotted entity shape these animation records extend. Animation owns its contracts and no
// longer borrows the deprecated types-package entity (which now re-exports these instead).
interface AnimationEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

// Structurally identical to `EasingFunction` from @flighthq/easing; declared here so animation's contracts
// do not depend on the easing package.
type EasingFunction = (t: number) => number;

// How an AnimationTrack interpolates between keyframes. 'Step' holds the previous keyframe's value;
// 'Linear' interpolates component-wise (or slerps a quaternion track); 'Cubic' is a glTF-style cubic
// spline where each keyframe stores in-tangent, value, and out-tangent (3 * components per keyframe).
export type AnimationInterpolation = 'Cubic' | 'Linear' | 'Step';

export const AnimationInterpolationCubic = 'Cubic';
export const AnimationInterpolationLinear = 'Linear';
export const AnimationInterpolationStep = 'Step';

// How an AnimationPlayer repeats when `loop` is true. 'Repeat' wraps modulo the clip duration (the
// playhead jumps from the end back to the start); 'PingPong' reflects at each end, reversing the
// travel direction (the sign of `speed`) so the playhead bounces back and forth. Ignored when `loop`
// is false. Undefined on a player is treated as 'Repeat', keeping the plain boolean `loop` behavior.
export type AnimationLoopMode = 'PingPong' | 'Repeat';

export const AnimationLoopModePingPong = 'PingPong';
export const AnimationLoopModeRepeat = 'Repeat';

// One clip-owned marker. Payload remains opaque to the animation core; gameplay/audio/VFX consumers
// interpret it when an AnimationPlayer reports the crossing through its opt-in onEvent signal.
export interface AnimationClipEvent extends AnimationEntity {
  name: string;
  payload: unknown;
  time: number;
}

// One channel of an AnimationClip: a track plus an opaque `targetRef`. The animation core never
// interprets `targetRef` — binding a sampled value to a Node3D TRS, a bone, or a tween target is
// the domain layer's job (scene / skeleton / tween). This is what keeps the core target-free and 3D-free.
export interface AnimationChannel extends AnimationEntity {
  track: AnimationTrack;
  targetRef: unknown;
}

// A target-free animation curve: ascending keyframe `times` plus a flat `values` buffer, sampled by
// sampleAnimationTrack. `components` is the value width per keyframe (1 = scalar, 3 = Vector3, 4 =
// Quaternion or packed color). For 'Step'/'Linear' the buffer holds `components` numbers per keyframe;
// for 'Cubic' it holds 3 * `components` per keyframe (in-tangent, value, out-tangent), glTF-style.
// When `quaternion` is true the four components are a unit quaternion [x, y, z, w] and 'Linear'
// sampling slerps instead of interpolating component-wise. `easing`, when non-null, reshapes the
// interpolation alpha for every segment. `segmentEasings`, when non-null, contains one optional
// override per interval (`times.length - 1`); a null entry falls back to the track-wide easing.
export interface AnimationTrack extends AnimationEntity {
  interpolation: AnimationInterpolation;
  times: ArrayLike<number>;
  values: ArrayLike<number>;
  components: number;
  quaternion: boolean;
  easing: EasingFunction | null;
  segmentEasings: ReadonlyArray<EasingFunction | null> | null;
}

// The kind of problem validateAnimationTrack found. 'nonAscendingTimes' means a keyframe time is not
// strictly greater than its predecessor; 'valuesLengthMismatch' means the flat `values` buffer length
// does not equal keyCount * componentsPerKeyframe (components for step/linear, 3 * components for cubic).
export type AnimationTrackValidationCode =
  | 'nonAscendingTimes'
  | 'segmentEasingsLengthMismatch'
  | 'valuesLengthMismatch';

// A single structural issue reported by validateAnimationTrack. `index` is the offending keyframe index
// for time-ordering issues, or null for whole-buffer issues.
export interface AnimationTrackValidationDiagnostic {
  code: AnimationTrackValidationCode;
  index: number | null;
  message: string;
}

// A bundle of channels with a total `duration` in seconds. Sampling a clip means sampling each
// channel's track at the playhead time (sampleAnimationTrack) and applying it to that channel's
// `targetRef` — the apply step is the domain layer's, keeping the clip itself target-free.
export interface AnimationClip extends AnimationEntity {
  channels: AnimationChannel[];
  duration: number;
  events: AnimationClipEvent[];
}

// Caller-visible weighted animation-sample accumulation state. `values` is the weighted component
// sum, `weight` its total, and `quaternion` selects hemisphere-aware quaternion finalization for a
// four-component sample. Reset/reuse it across channels or frames; it owns no target binding.
export interface AnimationSampleAccumulator extends AnimationEntity {
  components: number;
  quaternion: boolean;
  values: Float32Array;
  weight: number;
}

// The explicit time driver for an AnimationClip — the app advances it each frame
// (advanceAnimationPlayer); nothing auto-runs. `time` is the playhead in seconds, `speed` scales the
// advanced dt (negative plays backward), `loop` wraps at the clip duration (otherwise time clamps to
// [0, duration] and `playing` is cleared at the end), and `playing` gates advancement.
//
// `loopMode` (undefined = 'Repeat') selects how looping wraps: 'Repeat' jumps end→start, 'PingPong'
// reflects at each end and flips the sign of `speed`. `repeatCount` (undefined or negative = infinite)
// is the remaining number of loop wraps/bounces permitted; each wrap decrements it and playback stops
// once it reaches zero. `onFinished`/`onLooped` are opt-in signals allocated by
// enableAnimationPlayerSignals; `onEvent` reports crossed clip markers through the same opt-in path.
// All are null/undefined until enabled, so a bare player stays signal-free.
export interface AnimationPlayer extends AnimationEntity {
  clip: AnimationClip;
  loop: boolean;
  loopMode?: AnimationLoopMode;
  onEvent?: Signal<Readonly<AnimationClipEvent>> | null;
  onFinished?: Signal<void> | null;
  onLooped?: Signal<void> | null;
  playing: boolean;
  repeatCount?: number;
  speed: number;
  time: number;
}

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
export interface AnimationCrossfade extends AnimationEntity {
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

// One weighted leaf in an AnimationBlendTree. Override leaves contribute to a normalized N-way pose;
// additive leaves are applied afterward as weighted deltas. The player remains caller-visible and may
// be shared with another tree; advancement de-duplicates shared player identity within one tree.
export interface AnimationBlendTreeInput extends AnimationEntity {
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
export interface AnimationBlendTree extends AnimationEntity {
  channels: readonly Readonly<AnimationBlendTreeChannel>[];
  inputs: readonly AnimationBlendTreeInput[];
  players: readonly AnimationPlayer[];
  sampleScratch: Float32Array;
}

export interface AnimationLayerOptions {
  additive?: boolean;
  channelIndices?: readonly number[];
  weight?: number;
}

// One ordered pose layer. Exactly one source field is non-null. `channelIndices` is null for every
// source channel, or a validated subset in source-channel order. Override layers blend toward their
// pose; additive layers compose weighted deltas after the pose accumulated below them.
export interface AnimationLayer extends AnimationEntity {
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
export interface AnimationLayerStack extends AnimationEntity {
  advanceScratch: AnimationPlayer[];
  blendTrees: readonly AnimationBlendTree[];
  channels: readonly Readonly<AnimationLayerStackChannel>[];
  layers: readonly AnimationLayer[];
  sampleScratch: Float32Array;
  stateMachines: readonly AnimationStateMachine[];
}

// Reusable target-free root-motion extraction state for one caller-selected clip channel. Vector
// channels produce additive component deltas; quaternion channels produce a compositional rotation
// delta. Callers create separate extractors when translation and rotation use separate channels.
export interface AnimationRootMotionExtractor extends AnimationEntity {
  channel: Readonly<AnimationChannel>;
  channelIndex: number;
  clip: Readonly<AnimationClip>;
  cycleDelta: Float32Array;
  fromMotion: Float32Array;
  fromSample: Float32Array;
  powerScratch: Float32Array;
  startSample: Float32Array;
  toMotion: Float32Array;
  toSample: Float32Array;
}

// One named pose state. A state owns no hidden playback behavior: its blend tree contains the explicit
// players and weights that the caller may inspect or edit.
export interface AnimationStateMachineState extends AnimationEntity {
  blendTree: AnimationBlendTree;
  name: string;
}

// Per-target correspondence across all states. A null entry means that state does not animate the target.
export interface AnimationStateMachineChannel {
  channel: Readonly<AnimationChannel>;
  stateChannelIndices: readonly (number | null)[];
}

// Imperatively driven animation state machine. transitionAnimationStateMachine starts one named timed
// transition at a time; callers own gameplay conditions and call advance/sample explicitly. The global
// channel layout and scratch buffers make transition sampling allocation-free after construction.
export interface AnimationStateMachine extends AnimationEntity {
  advanceScratch: AnimationPlayer[];
  channels: readonly Readonly<AnimationStateMachineChannel>[];
  currentStateIndex: number;
  fromSample: Float32Array;
  states: readonly AnimationStateMachineState[];
  toSample: Float32Array;
  transitionCurve: EasingFunction;
  transitionDuration: number;
  transitionElapsed: number;
  transitionFromStateIndex: number | null;
  transitionToStateIndex: number | null;
  transitionWeight: number;
}

export type PlayMode = 'loop' | 'once';
