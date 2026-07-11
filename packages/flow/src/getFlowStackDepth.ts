import type { FlowStack } from '@flighthq/types';

// The number of states on the stack.
export function getFlowStackDepth(stack: Readonly<FlowStack>): number {
  return stack.states.length;
}
