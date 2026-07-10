import type { GameState, GameStateStack } from '@flighthq/types';

// The active top of the stack — the state currently receiving `onUpdate` — or `null` if the stack is
// empty.
export function getActiveGameState(stack: Readonly<GameStateStack>): GameState | null {
  const states = stack.states;
  return states.length > 0 ? states[states.length - 1] : null;
}
