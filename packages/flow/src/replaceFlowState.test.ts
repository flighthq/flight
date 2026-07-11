import type { FlowState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createFlowStack } from './createFlowStack';
import { pushFlowState } from './pushFlowState';
import { replaceFlowState } from './replaceFlowState';

describe('replaceFlowState', () => {
  it('exits the top and enters the replacement without touching the state below', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    const a = labeledState('A', log);
    pushFlowState(stack, a);
    pushFlowState(stack, labeledState('B', log));
    log.length = 0;
    replaceFlowState(stack, labeledState('C', log));
    expect(log).toEqual(['B.exit', 'C.enter']);
    expect(stack.states.length).toBe(2);
    expect(stack.states[0]).toBe(a);
  });

  it('just pushes and enters on an empty stack', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    replaceFlowState(stack, labeledState('C', log));
    expect(log).toEqual(['C.enter']);
    expect(stack.states.length).toBe(1);
  });

  it('does not throw when states omit callbacks', () => {
    const stack = createFlowStack();
    stack.states.push({});
    expect(() => replaceFlowState(stack, {})).not.toThrow();
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
