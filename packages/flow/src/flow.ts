// Generated from crates/flight-flow/src/flow.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';

import { reportFlowGuard } from './flowGuards.ts';
import { runFlowTransition } from './flowTransitions.ts';
import type { FlowCallback, FlowStackRaw, FlowState } from './flowTypes.ts';
import type { FlowGuardState } from './types.ts';

/**
 * Shared caller-owned flow-guard state.
 */
export type FlowGuardStateRef = FlowGuardState;

function noFlowCallback(): void {}

function noFlowUpdateCallback(deltaTime: number): void {
  if (Number.isNaN(deltaTime)) {
    return;
  }
}

function getFlowStateOnPause(state: FlowState | null): FlowCallback {
  if (state !== null) {
    const previous = state;
    return previous!.onPause ?? noFlowCallback;
  }
  return noFlowCallback;
}

/**
 * Empty the stack, exiting every state top-to-bottom. Callbacks run after the stack write lock is
 * released, so they may re-enter other flow operations.
 */
export function clearFlowStack(stack: FlowStackRaw): void {
  let index = stack!.states.length;
  while (index > 0) {
    index -= 1;
    const maybeOnExit = (() => {
      const current = stack!;
      return index < current.states.length ? current.states[index]!.onExit : null;
    })();
    const callback = maybeOnExit ?? noFlowCallback;
    callback();
  }
  stack!.states.length = 0;
}

export function createFlowStack(): FlowStackRaw {
  let out: FlowStackRaw = Object.assign(allocateEntity<FlowStackRaw>(), { states: [] });
  initializeFlowStack(out);
  return out;
}

/**
 * The active top of the stack, or None when the stack is empty.
 */
export function getActiveFlowState(stack: FlowStackRaw): FlowState | null {
  const current = stack!;
  if (current.states.length === 0) {
    return null;
  }
  return current.states[current.states.length - 1];
}

/**
 * The number of states on the stack.
 */
export function getFlowStackDepth(stack: FlowStackRaw): number {
  return stack!.states.length;
}

/**
 * Fill `out` (cleared first) with the render-visible states bottom-to-top.
 */
export function getFlowStackVisibleStates(out: FlowState[], stack: FlowStackRaw): void {
  out.length = 0;
  const states = stack!;
  const top = (states.states.length | 0) - 1;
  if (top < 0) {
    return;
  }
  let lowest = top >>> 0;
  while (lowest > 0 && (states.states[lowest]!.renderBelow ?? false)) {
    lowest -= 1;
  }
  for (let index = lowest; index <= top >>> 0; index += 1) {
    out.push(states.states[index]);
  }
}

/**
 * Initialize a flow stack to its empty state, keeping the allocated runtime slot.
 */
export function initializeFlowStack(out: FlowStackRaw): void {
  out.states = [] as never[];
}

/**
 * Pop the active top, exiting it and resuming the revealed state. None on an empty stack.
 */
export function popFlowState(stack: FlowStackRaw): FlowState | null {
  let popped: FlowState;
  const maybePopped = takeTopFlowState(stack);
  if (maybePopped !== null) {
    const value = maybePopped;
    popped = value;
  } else {
    return null;
  }
  const maybeOnExit = popped!.onExit;
  const exitCallback = maybeOnExit ?? noFlowCallback;
  exitCallback();
  const maybeRevealed = (() => {
    const current = stack!;
    return current.states.length === 0 ? null : current.states[current.states.length - 1];
  })();
  if (maybeRevealed !== null) {
    const revealedState = maybeRevealed;
    const maybeOnResume = revealedState!.onResume;
    const resumeCallback = maybeOnResume ?? noFlowCallback;
    resumeCallback();
  }
  return popped;
}

function takeTopFlowState(stack: FlowStackRaw): FlowState | null {
  let current = stack!;
  if (current.states.length === 0) {
    return null;
  }
  const top = current.states.length - 1;
  let previous: FlowState[] = [] as never[];
  for (const state of current.states) {
    previous.push(state);
  }
  const popped = previous[top];
  current.states.length = 0;
  for (const item of previous) {
    if (current.states.length >= top) {
      break;
    }
    current.states.push(item);
  }
  return popped;
}

/**
 * Portable push behavior: pause the previous top, push, then enter. Target-native wrappers own the
 * balanced unwind scope and pass the depth they observed.
 */
export function pushFlowState(stack: FlowStackRaw, state: FlowState, guards: Readonly<FlowGuardStateRef>): void {
  const transitionStack = stack;
  const transitionGuards = guards;
  runFlowTransition(guards, (depth) => {
    pushFlowStateCore(transitionStack, state, transitionGuards, depth);
  });
}

function pushFlowStateCore(
  stack: FlowStackRaw,
  state: FlowState,
  guards: Readonly<FlowGuardStateRef>,
  depth: number,
): void {
  if (depth > 0) {
    reportFlowGuard(guards, 'transition-during-transition');
  }
  const duplicate = stack!.states.some((existing) => existing === state);
  if (duplicate) {
    reportFlowGuard(guards, 'duplicate-state-push');
  }
  const previousTop = (() => {
    const current = stack!;
    return current.states.length === 0 ? null : current.states[current.states.length - 1];
  })();
  const previousOnPause = getFlowStateOnPause(previousTop);
  const maybeOnEnter = state!.onEnter;
  previousOnPause();
  stack!.states.push(state);
  const enterCallback = maybeOnEnter ?? noFlowCallback;
  enterCallback();
}

/**
 * Portable replace behavior: swap the active top in place without touching the state beneath.
 */
export function replaceFlowState(stack: FlowStackRaw, state: FlowState, guards: Readonly<FlowGuardStateRef>): void {
  const transitionStack = stack;
  const transitionGuards = guards;
  runFlowTransition(guards, (depth) => {
    replaceFlowStateCore(transitionStack, state, transitionGuards, depth);
  });
}

function replaceFlowStateCore(
  stack: FlowStackRaw,
  state: FlowState,
  guards: Readonly<FlowGuardStateRef>,
  depth: number,
): void {
  if (depth > 0) {
    reportFlowGuard(guards, 'transition-during-transition');
  }
  const maybePreviousTop = takeTopFlowState(stack);
  if (maybePreviousTop !== null) {
    const previousState = maybePreviousTop;
    const maybeOnExit = previousState!.onExit;
    const exitCallback = maybeOnExit ?? noFlowCallback;
    exitCallback();
  }
  const maybeOnEnter = state!.onEnter;
  stack!.states.push(state);
  const enterCallback = maybeOnEnter ?? noFlowCallback;
  enterCallback();
}

/**
 * Tick one frame: the active top updates; each visited state with `updateBelow` also ticks the
 * state beneath it. Callbacks run with no lock held.
 */
export function updateFlowStack(stack: FlowStackRaw, deltaTime: number): void {
  const states = [...stack!.states];
  let index = (states.length | 0) - 1;
  if (index < 0) {
    return;
  }
  for (;;) {
    const state = states[index >>> 0];
    const [maybeOnUpdate, updateBelow] = (() => {
      const borrowed = state!;
      return [borrowed.onUpdate, borrowed.updateBelow ?? false];
    })();
    const callback = maybeOnUpdate ?? noFlowUpdateCallback;
    callback(deltaTime);
    if (index <= 0 || !updateBelow) {
      break;
    }
    index -= 1;
  }
}
