import type { FlowStack } from '@flighthq/types';

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
