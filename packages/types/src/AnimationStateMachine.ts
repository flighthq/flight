import type { AnimationBlendTree } from './AnimationBlendTree';
import type { AnimationChannel } from './AnimationChannel';
import type { AnimationPlayer } from './AnimationPlayer';
import type { EasingFunction } from './EasingFunction';
import type { Entity } from './Entity';

// One named pose state. A state owns no hidden playback behavior: its blend tree contains the explicit
// players and weights that the caller may inspect or edit.
export interface AnimationStateMachineState extends Entity {
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
export interface AnimationStateMachine extends Entity {
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
