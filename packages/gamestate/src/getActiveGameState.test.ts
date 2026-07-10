import { describe, expect, it } from 'vitest';

import { createGameStateStack } from './createGameStateStack';
import { getActiveGameState } from './getActiveGameState';
import { pushGameState } from './pushGameState';

describe('getActiveGameState', () => {
  it('returns the top of the stack', () => {
    const stack = createGameStateStack();
    const a = { name: 'A' };
    const b = { name: 'B' };
    pushGameState(stack, a);
    pushGameState(stack, b);
    expect(getActiveGameState(stack)).toBe(b);
  });

  it('returns null on an empty stack', () => {
    const stack = createGameStateStack();
    expect(getActiveGameState(stack)).toBeNull();
  });
});
