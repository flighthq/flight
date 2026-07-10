import type { GameStateStack } from '@flighthq/types';

// Allocate an empty game-state stack. The only allocating function; every other stack function reads
// or mutates an existing stack in place. Push states onto it to drive the enter/pause lifecycle.
export function createGameStateStack(): GameStateStack {
  return { states: [] };
}
