import type { FlowState, FlowStack } from '@flighthq/types';

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
