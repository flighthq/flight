import { describe, expect, it } from 'vitest';

import { createGameStateStack } from './createGameStateStack';
import { getGameStateStackDepth } from './getGameStateStackDepth';
import { popGameState } from './popGameState';
import { pushGameState } from './pushGameState';

describe('getGameStateStackDepth', () => {
  it('counts the states on the stack', () => {
    const stack = createGameStateStack();
    expect(getGameStateStackDepth(stack)).toBe(0);
    pushGameState(stack, { name: 'A' });
    pushGameState(stack, { name: 'B' });
    expect(getGameStateStackDepth(stack)).toBe(2);
    popGameState(stack);
    expect(getGameStateStackDepth(stack)).toBe(1);
  });
});
