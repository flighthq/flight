import type { GameState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createGameStateStack } from './createGameStateStack';
import { pushGameState } from './pushGameState';
import { updateGameStateStack } from './updateGameStateStack';

describe('updateGameStateStack', () => {
  it('ticks only the top with the frame deltaTime', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    pushGameState(stack, labeledState('A', log));
    pushGameState(stack, labeledState('B', log));
    log.length = 0;
    updateGameStateStack(stack, 0.016);
    expect(log).toEqual(['B.update:0.016']);
  });

  it('ticks the state beneath a transparent updateBelow overlay', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    pushGameState(stack, labeledState('A', log));
    pushGameState(stack, labeledState('B', log, { updateBelow: true }));
    log.length = 0;
    updateGameStateStack(stack, 0.02);
    expect(log).toEqual(['B.update:0.02', 'A.update:0.02']);
  });

  it('does not tick below an opaque overlay', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    pushGameState(stack, labeledState('A', log));
    pushGameState(stack, labeledState('B', log));
    log.length = 0;
    updateGameStateStack(stack, 0.01);
    expect(log).toEqual(['B.update:0.01']);
  });

  it('walks a chain of updateBelow overlays and stops at the first opaque one', () => {
    const log: string[] = [];
    const stack = createGameStateStack();
    pushGameState(stack, labeledState('A', log));
    pushGameState(stack, labeledState('B', log));
    pushGameState(stack, labeledState('C', log, { updateBelow: true }));
    pushGameState(stack, labeledState('D', log, { updateBelow: true }));
    log.length = 0;
    updateGameStateStack(stack, 0.5);
    expect(log).toEqual(['D.update:0.5', 'C.update:0.5', 'B.update:0.5']);
  });

  it('is a no-op on an empty stack', () => {
    const stack = createGameStateStack();
    expect(() => updateGameStateStack(stack, 0.016)).not.toThrow();
  });

  it('does not throw when a ticked state omits onUpdate', () => {
    const stack = createGameStateStack();
    stack.states.push({ updateBelow: true }, {});
    expect(() => updateGameStateStack(stack, 0.016)).not.toThrow();
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
