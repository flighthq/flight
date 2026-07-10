import type { GameState, GameStateStack } from '@flighthq/types';

// Fill `out` (cleared first) with the render-visible states in draw order, bottom-to-top: the active
// top plus the contiguous run of states beneath it reachable through `renderBelow`. Walking down from
// the top, each state that sets `renderBelow` keeps the one beneath it visible; the walk stops at the
// first opaque state (no `renderBelow`), which is itself visible but hides everything below it. The
// caller draws `out` front-to-back (index 0 first) so higher states paint over lower ones. `out` is
// empty for an empty stack.
export function getGameStateStackVisibleStates(stack: Readonly<GameStateStack>, out: GameState[]): void {
  out.length = 0;
  const states = stack.states;
  const top = states.length - 1;
  if (top < 0) {
    return;
  }
  let lowest = top;
  while (lowest > 0 && states[lowest].renderBelow) {
    lowest--;
  }
  for (let i = lowest; i <= top; i++) {
    out.push(states[i]);
  }
}
