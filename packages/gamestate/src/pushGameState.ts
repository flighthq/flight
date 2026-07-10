import type { GameState, GameStateStack } from '@flighthq/types';

// Push `state` onto the stack, making it the active top. The previous top (if any) is paused first
// (`onPause`), then `state` is pushed and entered (`onEnter`) — pause-then-enter, so the outgoing
// state is suspended before the incoming one starts.
export function pushGameState(stack: GameStateStack, state: Readonly<GameState>): void {
  const states = stack.states;
  const previousTop = states.length > 0 ? states[states.length - 1] : null;
  previousTop?.onPause?.();
  states.push(state);
  state.onEnter?.();
}
