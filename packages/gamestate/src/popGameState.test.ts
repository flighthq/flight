import type { GameState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createGameStateStack } from './createGameStateStack';
import { popGameState } from './popGameState';
import { pushGameState } from './pushGameState';

describe('popGameState', () => {
  it('exits the top and resumes the revealed state, returning the popped state', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    const a = labeledState('A', log);
    const b = labeledState('B', log);
    pushGameState(stack, a);
    pushGameState(stack, b);
    log.length = 0;
    const popped = popGameState(stack);
    expect(log).toEqual(['B.exit', 'A.resume']);
    expect(popped).toBe(b);
    expect(stack.states.length).toBe(1);
  });

  it('returns null when the stack is empty', () => {
    const stack = createGameStateStack();
    expect(popGameState(stack)).toBeNull();
  });

  it('exits the last state without resuming anything below', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    pushGameState(stack, labeledState('A', log));
    log.length = 0;
    popGameState(stack);
    expect(log).toEqual(['A.exit']);
  });

  it('does not throw when the popped state omits callbacks', () => {
    const stack = createGameStateStack();
    stack.states.push({});
    expect(() => popGameState(stack)).not.toThrow();
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
