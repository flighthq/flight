import type { FlowStack } from '@flighthq/types';

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
