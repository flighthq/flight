import type { GameState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createGameStateStack } from './createGameStateStack';
import { getGameStateStackVisibleStates } from './getGameStateStackVisibleStates';
import { pushGameState } from './pushGameState';

describe('getGameStateStackVisibleStates', () => {
  it('fills only the top when it is opaque', () => {
    const stack = createGameStateStack();
    const a = { name: 'A' };
    const b = { name: 'B' };
    pushGameState(stack, a);
    pushGameState(stack, b);
    const out: GameState[] = [];
    getGameStateStackVisibleStates(stack, out);
    expect(out).toEqual([b]);
  });

  it('includes the contiguous renderBelow run bottom-to-top', () => {
    const stack = createGameStateStack();
    const a = { name: 'A' };
    const b: GameState = { name: 'B', renderBelow: true };
    const c: GameState = { name: 'C', renderBelow: true };
    pushGameState(stack, a);
    pushGameState(stack, b);
    pushGameState(stack, c);
    const out: GameState[] = [];
    getGameStateStackVisibleStates(stack, out);
    expect(out).toEqual([a, b, c]);
  });

  it('stops at the first opaque state below a translucent overlay', () => {
    const stack = createGameStateStack();
    const a = { name: 'A' };
    const b = { name: 'B' };
    const c: GameState = { name: 'C', renderBelow: true };
    pushGameState(stack, a);
    pushGameState(stack, b);
    pushGameState(stack, c);
    const out: GameState[] = [];
    getGameStateStackVisibleStates(stack, out);
    expect(out).toEqual([b, c]);
  });

  it('clears the out array before filling and can be reused', () => {
    const stack = createGameStateStack();
    const a = { name: 'A' };
    pushGameState(stack, a);
    const out: GameState[] = [{ name: 'stale' }, { name: 'leftover' }];
    getGameStateStackVisibleStates(stack, out);
    expect(out).toEqual([a]);
  });

  it('leaves the out array empty for an empty stack', () => {
    const stack = createGameStateStack();
    const out: GameState[] = [{ name: 'stale' }];
    getGameStateStackVisibleStates(stack, out);
    expect(out).toEqual([]);
  });
});
