import type { FlowState, FlowStack } from '@flighthq/types';

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
