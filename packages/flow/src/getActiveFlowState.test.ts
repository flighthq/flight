import { describe, expect, it } from 'vitest';

import { createFlowStack } from './createFlowStack';
import { getActiveFlowState } from './getActiveFlowState';
import { pushFlowState } from './pushFlowState';

describe('getActiveFlowState', () => {
  it('returns the top of the stack', () => {
    const stack = createFlowStack();
    const a = { name: 'A' };
    const b = { name: 'B' };
    pushFlowState(stack, a);
    pushFlowState(stack, b);
    expect(getActiveFlowState(stack)).toBe(b);
  });

  it('returns null on an empty stack', () => {
    const stack = createFlowStack();
    expect(getActiveFlowState(stack)).toBeNull();
  });
});
