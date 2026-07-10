import type { FlowState, FlowStack } from '@flighthq/types';

// The active top of the stack — the state currently receiving `onUpdate` — or `null` if the stack is
// empty.
export function getActiveFlowState(stack: Readonly<FlowStack>): FlowState | null {
  const states = stack.states;
  return states.length > 0 ? states[states.length - 1] : null;
}
