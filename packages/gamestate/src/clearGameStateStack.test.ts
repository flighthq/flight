import type { GameState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { clearGameStateStack } from './clearGameStateStack';
import { createGameStateStack } from './createGameStateStack';
import { pushGameState } from './pushGameState';

describe('clearGameStateStack', () => {
  it('exits every state top-to-bottom and empties the stack', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    pushGameState(stack, labeledState('A', log));
    pushGameState(stack, labeledState('B', log));
    pushGameState(stack, labeledState('C', log));
    log.length = 0;
    clearGameStateStack(stack);
    expect(log).toEqual(['C.exit', 'B.exit', 'A.exit']);
    expect(stack.states.length).toBe(0);
  });

  it('is a no-op on an empty stack', () => {
    const stack = createGameStateStack();
    expect(() => clearGameStateStack(stack)).not.toThrow();
    expect(stack.states.length).toBe(0);
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
