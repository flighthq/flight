import { createEntity } from '@flighthq/entity';
import type {
  AnimationBlendTree,
  AnimationChannel,
  AnimationPlayer,
  AnimationStateMachine,
  AnimationStateMachineChannel,
  AnimationStateMachineState,
  EasingFunction,
} from '@flighthq/types';

import { blendAnimationSamples } from './animationBlend';
import { sampleAnimationBlendTree, sampleAnimationBlendTreeChannel } from './animationBlendTree';
import { advanceAnimationPlayer } from './animationPlayer';

// Advances the current state, or both sides of an active transition, then advances transition time.
// Shared player identity is advanced once. Completion selects the destination state by elapsed duration,
// independently of a curve that overshoots or undershoots its endpoint.
export function advanceAnimationStateMachine(machine: AnimationStateMachine, dt: number): void {
  const advanced = machine.advanceScratch;
  advanced.length = 0;
  advanceAnimationStateMachineTree(machine.states[machine.currentStateIndex].blendTree, dt, advanced);
  const toIndex = machine.transitionToStateIndex;
  if (toIndex === null) return;
  advanceAnimationStateMachineTree(machine.states[toIndex].blendTree, dt, advanced);
  machine.transitionElapsed += dt;
  machine.transitionWeight = machine.transitionCurve(
    getLinearAnimationStateMachineTransitionWeight(machine.transitionElapsed, machine.transitionDuration),
  );
  if (machine.transitionDuration <= 0 || machine.transitionElapsed >= machine.transitionDuration) {
    machine.currentStateIndex = toIndex;
    machine.transitionFromStateIndex = null;
    machine.transitionToStateIndex = null;
  }
}

// Allocates a named-state controller with a global target correspondence layout and reusable transition
// scratch. Gameplay conditions remain external: callers explicitly request a named timed transition.
export function createAnimationStateMachine(
  states: readonly AnimationStateMachineState[],
  initialState: string | number = 0,
): AnimationStateMachine {
  if (states.length === 0) throw new RangeError('AnimationStateMachine requires at least one state.');
  const copiedStates = states.slice();
  const stateByName = new Map<string, number>();
  for (let index = 0; index < copiedStates.length; index++) {
    const name = copiedStates[index].name;
    if (stateByName.has(name)) throw new TypeError(`AnimationStateMachine contains duplicate state "${name}".`);
    stateByName.set(name, index);
  }
  const initialStateIndex =
    typeof initialState === 'number' ? initialState : (stateByName.get(initialState) ?? copiedStates.length);
  if (!Number.isInteger(initialStateIndex) || initialStateIndex < 0 || initialStateIndex >= copiedStates.length) {
    throw new RangeError(`AnimationStateMachine initial state "${String(initialState)}" does not exist.`);
  }

  const channels = createAnimationStateMachineChannels(copiedStates);
  let sampleWidth = 0;
  for (const entry of channels) sampleWidth = Math.max(sampleWidth, entry.channel.track.components);
  return createEntity({
    advanceScratch: [],
    channels,
    currentStateIndex: initialStateIndex,
    fromSample: new Float32Array(sampleWidth),
    states: copiedStates,
    toSample: new Float32Array(sampleWidth),
    transitionCurve: linearAnimationStateMachineCurve,
    transitionDuration: 0,
    transitionElapsed: 0,
    transitionFromStateIndex: null,
    transitionToStateIndex: null,
    transitionWeight: 0,
  });
}

// Allocates one named state over a blend tree.
export function createAnimationStateMachineState(
  name: string,
  blendTree: AnimationBlendTree,
): AnimationStateMachineState {
  return createEntity({ blendTree, name });
}

// Returns the active state. During a transition this remains the source until the duration completes.
export function getAnimationStateMachineCurrentState(
  machine: Readonly<AnimationStateMachine>,
): Readonly<AnimationStateMachineState> {
  return machine.states[machine.currentStateIndex];
}

// Reports whether a timed transition is active.
export function isAnimationStateMachineTransitioning(machine: Readonly<AnimationStateMachine>): boolean {
  return machine.transitionToStateIndex !== null;
}

// Samples the current state or blends both sides of an active transition by target identity. One-sided
// targets pass through, preserving AnimationCrossfade behavior. Allocation-free after construction.
export function sampleAnimationStateMachine(
  out: number[] | Float32Array,
  machine: Readonly<AnimationStateMachine>,
  visit: (sampled: Readonly<number[] | Float32Array>, channel: Readonly<AnimationChannel>, index: number) => void,
): void {
  const toStateIndex = machine.transitionToStateIndex;
  if (toStateIndex === null) {
    sampleAnimationBlendTree(out, machine.states[machine.currentStateIndex].blendTree, visit);
    return;
  }
  const fromStateIndex = machine.transitionFromStateIndex!;
  const fromTree = machine.states[fromStateIndex].blendTree;
  const toTree = machine.states[toStateIndex].blendTree;
  for (let index = 0; index < machine.channels.length; index++) {
    const entry = machine.channels[index];
    const fromChannelIndex = entry.stateChannelIndices[fromStateIndex];
    const toChannelIndex = entry.stateChannelIndices[toStateIndex];
    const hasFrom =
      fromChannelIndex !== null && sampleAnimationBlendTreeChannel(machine.fromSample, fromTree, fromChannelIndex);
    const hasTo = toChannelIndex !== null && sampleAnimationBlendTreeChannel(machine.toSample, toTree, toChannelIndex);
    if (!hasFrom && !hasTo) continue;
    if (hasFrom && hasTo) {
      blendAnimationSamples(
        out,
        machine.fromSample,
        machine.toSample,
        machine.transitionWeight,
        entry.channel.track.quaternion,
      );
    } else {
      const source = hasFrom ? machine.fromSample : machine.toSample;
      const width = Math.min(out.length, entry.channel.track.components, source.length);
      for (let component = 0; component < width; component++) out[component] = source[component];
    }
    visit(out, entry.channel, index);
  }
}

// Starts a timed transition to a named or indexed state. Returns false for an unknown/same destination
// or while another transition is active. A zero-duration transition selects its destination immediately.
export function transitionAnimationStateMachine(
  machine: AnimationStateMachine,
  toState: string | number,
  duration: number,
  curve: EasingFunction = linearAnimationStateMachineCurve,
): boolean {
  if (machine.transitionToStateIndex !== null) return false;
  const toStateIndex = findAnimationStateMachineStateIndex(machine.states, toState);
  if (toStateIndex < 0 || toStateIndex === machine.currentStateIndex) return false;
  machine.transitionCurve = curve;
  machine.transitionDuration = Math.max(0, duration);
  machine.transitionElapsed = 0;
  machine.transitionFromStateIndex = machine.currentStateIndex;
  machine.transitionToStateIndex = toStateIndex;
  machine.transitionWeight = curve(getLinearAnimationStateMachineTransitionWeight(0, machine.transitionDuration));
  if (machine.transitionDuration === 0) {
    machine.currentStateIndex = toStateIndex;
    machine.transitionFromStateIndex = null;
    machine.transitionToStateIndex = null;
  }
  return true;
}

function advanceAnimationStateMachineTree(
  tree: Readonly<AnimationBlendTree>,
  dt: number,
  advanced: AnimationPlayer[],
): void {
  for (const player of tree.players) {
    if (advanced.includes(player)) continue;
    advanced.push(player);
    advanceAnimationPlayer(player, dt);
  }
}

function assertCompatibleAnimationStateMachineChannels(
  existing: Readonly<AnimationChannel>,
  channel: Readonly<AnimationChannel>,
): void {
  if (
    existing.track.components !== channel.track.components ||
    existing.track.quaternion !== channel.track.quaternion
  ) {
    throw new TypeError('AnimationStateMachine target has incompatible tracks across states.');
  }
}

function createAnimationStateMachineChannels(
  states: readonly Readonly<AnimationStateMachineState>[],
): AnimationStateMachineChannel[] {
  const channels: AnimationStateMachineChannel[] = [];
  const channelByTarget = new Map<unknown, number>();
  for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
    const stateChannels = states[stateIndex].blendTree.channels;
    for (let stateChannelIndex = 0; stateChannelIndex < stateChannels.length; stateChannelIndex++) {
      const channel = stateChannels[stateChannelIndex].channel;
      const existingIndex = channelByTarget.get(channel.targetRef);
      if (existingIndex === undefined) {
        const stateChannelIndices = new Array<number | null>(states.length).fill(null);
        stateChannelIndices[stateIndex] = stateChannelIndex;
        channelByTarget.set(channel.targetRef, channels.length);
        channels.push({ channel, stateChannelIndices });
        continue;
      }
      const existing = channels[existingIndex];
      assertCompatibleAnimationStateMachineChannels(existing.channel, channel);
      (existing.stateChannelIndices as (number | null)[])[stateIndex] = stateChannelIndex;
    }
  }
  return channels;
}

function findAnimationStateMachineStateIndex(
  states: readonly Readonly<AnimationStateMachineState>[],
  state: string | number,
): number {
  if (typeof state === 'number') return Number.isInteger(state) && state >= 0 && state < states.length ? state : -1;
  for (let index = 0; index < states.length; index++) {
    if (states[index].name === state) return index;
  }
  return -1;
}

function getLinearAnimationStateMachineTransitionWeight(elapsed: number, duration: number): number {
  if (duration <= 0) return 1;
  const normalized = elapsed / duration;
  return normalized < 0 ? 0 : normalized > 1 ? 1 : normalized;
}

function linearAnimationStateMachineCurve(t: number): number {
  return t;
}
