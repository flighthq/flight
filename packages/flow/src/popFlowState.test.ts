import type { FlowState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createFlowStack } from './createFlowStack';
import { popFlowState } from './popFlowState';
import { pushFlowState } from './pushFlowState';

describe('popFlowState', () => {
  it('exits the top and resumes the revealed state, returning the popped state', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    const a = labeledState('A', log);
    const b = labeledState('B', log);
    pushFlowState(stack, a);
    pushFlowState(stack, b);
    log.length = 0;
    const popped = popFlowState(stack);
    expect(log).toEqual(['B.exit', 'A.resume']);
    expect(popped).toBe(b);
    expect(stack.states.length).toBe(1);
  });

  it('returns null when the stack is empty', () => {
    const stack = createFlowStack();
    expect(popFlowState(stack)).toBeNull();
  });

  it('exits the last state without resuming anything below', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    pushFlowState(stack, labeledState('A', log));
    log.length = 0;
    popFlowState(stack);
    expect(log).toEqual(['A.exit']);
  });

  it('does not throw when the popped state omits callbacks', () => {
    const stack = createFlowStack();
    stack.states.push({});
    expect(() => popFlowState(stack)).not.toThrow();
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
