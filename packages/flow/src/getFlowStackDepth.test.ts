import { describe, expect, it } from 'vitest';

import { createFlowStack } from './createFlowStack';
import { getFlowStackDepth } from './getFlowStackDepth';
import { popFlowState } from './popFlowState';
import { pushFlowState } from './pushFlowState';

describe('getFlowStackDepth', () => {
  it('counts the states on the stack', () => {
    const stack = createFlowStack();
    expect(getFlowStackDepth(stack)).toBe(0);
    pushFlowState(stack, { name: 'A' });
    pushFlowState(stack, { name: 'B' });
    expect(getFlowStackDepth(stack)).toBe(2);
    popFlowState(stack);
    expect(getFlowStackDepth(stack)).toBe(1);
  });
});
