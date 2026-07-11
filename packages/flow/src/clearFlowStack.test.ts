import type { FlowState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { clearFlowStack } from './clearFlowStack';
import { createFlowStack } from './createFlowStack';
import { pushFlowState } from './pushFlowState';

describe('clearFlowStack', () => {
  it('exits every state top-to-bottom and empties the stack', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    pushFlowState(stack, labeledState('A', log));
    pushFlowState(stack, labeledState('B', log));
    pushFlowState(stack, labeledState('C', log));
    log.length = 0;
    clearFlowStack(stack);
    expect(log).toEqual(['C.exit', 'B.exit', 'A.exit']);
    expect(stack.states.length).toBe(0);
  });

  it('is a no-op on an empty stack', () => {
    const stack = createFlowStack();
    expect(() => clearFlowStack(stack)).not.toThrow();
    expect(stack.states.length).toBe(0);
  });
});

function labeledState(name: string, log: string[], extra: Partial<FlowState> = {}): FlowState {
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
