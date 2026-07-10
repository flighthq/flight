import type { GameState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createGameStateStack } from './createGameStateStack';
import { pushGameState } from './pushGameState';

describe('pushGameState', () => {
  it('enters a state pushed onto an empty stack', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    pushGameState(stack, labeledState('A', log));
    expect(log).toEqual(['A.enter']);
  });

  it('pauses the previous top before entering the new state', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    pushGameState(stack, labeledState('A', log));
    log.length = 0;
    pushGameState(stack, labeledState('B', log));
    expect(log).toEqual(['A.pause', 'B.enter']);
    expect(stack.states.length).toBe(2);
  });

  it('does not throw when the states omit lifecycle callbacks', () => {
    const stack = createGameStateStack();
    pushGameState(stack, {});
    expect(() => pushGameState(stack, {})).not.toThrow();
    expect(stack.states.length).toBe(2);
  });
});

function labeledState(name: string, log: string[], extra: Partial<GameState> = {}): GameState {
  return {
    name,
    onEnter: () => log.push(`${name}.enter`),
    onExit: () => log.push(`${name}.exit`),
    onPause: () => log.push(`${name}.pause`),
    onResume: () => log.push(`${name}.resume`),
    onUpdate: (deltaTime) => log.push(`${name}.update:${deltaTime}`),
    ...extra,
  };
}
