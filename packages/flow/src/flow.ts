import type { FlowState, FlowStack } from '@flighthq/types';

// Empty the stack, exiting every state top-to-bottom (`onExit` on the active top first, down to the
// bottom) so each unwinds in reverse of the order it entered. No `onPause`/`onResume` fire — the
// whole stack is being torn down, not layered. After this the stack has depth 0.
export function clearFlowStack(stack: FlowStack): void {
  const states = stack.states;
  for (let i = states.length - 1; i >= 0; i--) {
    states[i].onExit?.();
  }
  states.length = 0;
}

// Allocate an empty flow-state stack. The only allocating function; every other stack function reads
// or mutates an existing stack in place. Push states onto it to drive the enter/pause lifecycle.
export function createFlowStack(): FlowStack {
  return { states: [] };
}

// The active top of the stack — the state currently receiving `onUpdate` — or `null` if the stack is
// empty.
export function getActiveFlowState(stack: Readonly<FlowStack>): FlowState | null {
  const states = stack.states;
  return states.length > 0 ? states[states.length - 1] : null;
}

// The number of states on the stack.
export function getFlowStackDepth(stack: Readonly<FlowStack>): number {
  return stack.states.length;
}

// Fill `out` (cleared first) with the render-visible states in draw order, bottom-to-top: the active
// top plus the contiguous run of states beneath it reachable through `renderBelow`. Walking down from
// the top, each state that sets `renderBelow` keeps the one beneath it visible; the walk stops at the
// first opaque state (no `renderBelow`), which is itself visible but hides everything below it. The
// caller draws `out` front-to-back (index 0 first) so higher states paint over lower ones. `out` is
// empty for an empty stack.
export function getFlowStackVisibleStates(stack: Readonly<FlowStack>, out: FlowState[]): void {
  out.length = 0;
  const states = stack.states;
  const top = states.length - 1;
  if (top < 0) {
    return;
  }
  let lowest = top;
  while (lowest > 0 && states[lowest].renderBelow) {
    lowest--;
  }
  for (let i = lowest; i <= top; i++) {
    out.push(states[i]);
  }
}

// Pop the active top off the stack, exiting it (`onExit`) and resuming the state it uncovers
// (`onResume`) — the mirror of `pushFlowState`. Returns the popped state, or `null` if the stack was
// empty (a sentinel, not a throw — popping an empty stack is an expected no-op query).
export function popFlowState(stack: FlowStack): FlowState | null {
  const states = stack.states;
  if (states.length === 0) {
    return null;
  }
  const popped = states.pop() as FlowState;
  popped.onExit?.();
  const revealed = states.length > 0 ? states[states.length - 1] : null;
  revealed?.onResume?.();
  return popped;
}

// Push `state` onto the stack, making it the active top. The previous top (if any) is paused first
// (`onPause`), then `state` is pushed and entered (`onEnter`) — pause-then-enter, so the outgoing
// state is suspended before the incoming one starts.
export function pushFlowState(stack: FlowStack, state: Readonly<FlowState>): void {
  const states = stack.states;
  const previousTop = states.length > 0 ? states[states.length - 1] : null;
  previousTop?.onPause?.();
  states.push(state);
  state.onEnter?.();
}

// Swap the active top for `state` in place, keeping the stack depth the same. The current top (if
// any) exits (`onExit`) and `state` enters (`onEnter`); the state beneath is NOT paused or resumed,
// because it stays covered throughout — replace swaps the top layer, it does not uncover the one
// below. On an empty stack this is just a push-and-enter.
export function replaceFlowState(stack: FlowStack, state: Readonly<FlowState>): void {
  const states = stack.states;
  if (states.length > 0) {
    const previousTop = states.pop() as FlowState;
    previousTop.onExit?.();
  }
  states.push(state);
  state.onEnter?.();
}

// Tick the stack for one frame. The active top always updates (`onUpdate(deltaTime)`); then, walking
// downward, each visited state that sets `updateBelow` also ticks the state immediately beneath it,
// continuing the chain until a visited state does not set `updateBelow`. So a run of transparent
// overlays all tick their underlying states, but an opaque overlay (no `updateBelow`) freezes
// everything below it. A no-op on an empty stack.
export function updateFlowStack(stack: Readonly<FlowStack>, deltaTime: number): void {
  const states = stack.states;
  let index = states.length - 1;
  if (index < 0) {
    return;
  }
  states[index].onUpdate?.(deltaTime);
  while (index > 0 && states[index].updateBelow) {
    index--;
    states[index].onUpdate?.(deltaTime);
  }
}
