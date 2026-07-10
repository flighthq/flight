import type { GameState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createGameStateStack } from './createGameStateStack';
import { pushGameState } from './pushGameState';
import { replaceGameState } from './replaceGameState';

describe('replaceGameState', () => {
  it('exits the top and enters the replacement without touching the state below', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    const a = labeledState('A', log);
    pushGameState(stack, a);
    pushGameState(stack, labeledState('B', log));
    log.length = 0;
    replaceGameState(stack, labeledState('C', log));
    expect(log).toEqual(['B.exit', 'C.enter']);
    expect(stack.states.length).toBe(2);
    expect(stack.states[0]).toBe(a);
  });

  it('just pushes and enters on an empty stack', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    replaceGameState(stack, labeledState('C', log));
    expect(log).toEqual(['C.enter']);
    expect(stack.states.length).toBe(1);
  });

  it('does not throw when states omit callbacks', () => {
    const stack = createGameStateStack();
    stack.states.push({});
    expect(() => replaceGameState(stack, {})).not.toThrow();
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
