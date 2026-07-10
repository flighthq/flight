import { describe, expect, it } from 'vitest';

import { createFlowStack } from './createFlowStack';

describe('createFlowStack', () => {
  it('allocates an empty stack', () => {
    const stack = createFlowStack();
    expect(stack.states).toEqual([]);
  });

  it('allocates a fresh independent stack each call', () => {
    const a = createFlowStack();
    const b = createFlowStack();
    expect(a).not.toBe(b);
    expect(a.states).not.toBe(b.states);
  });
});
