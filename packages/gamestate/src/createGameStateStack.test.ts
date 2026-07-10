import { describe, expect, it } from 'vitest';

import { createGameStateStack } from './createGameStateStack';

describe('createGameStateStack', () => {
  it('allocates an empty stack', () => {
    const stack = createGameStateStack();
    expect(stack.states).toEqual([]);
  });

  it('allocates a fresh independent stack each call', () => {
    const a = createGameStateStack();
    const b = createGameStateStack();
    expect(a).not.toBe(b);
    expect(a.states).not.toBe(b.states);
  });
});
