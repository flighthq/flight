import type { GameStateStack } from '@flighthq/types';

// The number of states on the stack.
export function getGameStateStackDepth(stack: Readonly<GameStateStack>): number {
  return stack.states.length;
}
