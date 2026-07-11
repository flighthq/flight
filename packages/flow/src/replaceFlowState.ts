import type { FlowState, FlowStack } from '@flighthq/types';

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
