import type { FlowState } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createFlowStack } from './createFlowStack';
import { getFlowStackVisibleStates } from './getFlowStackVisibleStates';
import { pushFlowState } from './pushFlowState';

describe('getFlowStackVisibleStates', () => {
  it('fills only the top when it is opaque', () => {
    const stack = createFlowStack();
    const a = { name: 'A' };
    const b = { name: 'B' };
    pushFlowState(stack, a);
    pushFlowState(stack, b);
    const out: FlowState[] = [];
    getFlowStackVisibleStates(stack, out);
    expect(out).toEqual([b]);
  });

  it('includes the contiguous renderBelow run bottom-to-top', () => {
    const stack = createFlowStack();
    const a = { name: 'A' };
    const b: FlowState = { name: 'B', renderBelow: true };
    const c: FlowState = { name: 'C', renderBelow: true };
    pushFlowState(stack, a);
    pushFlowState(stack, b);
    pushFlowState(stack, c);
    const out: FlowState[] = [];
    getFlowStackVisibleStates(stack, out);
    expect(out).toEqual([a, b, c]);
  });

  it('stops at the first opaque state below a translucent overlay', () => {
    const stack = createFlowStack();
    const a = { name: 'A' };
    const b = { name: 'B' };
    const c: FlowState = { name: 'C', renderBelow: true };
    pushFlowState(stack, a);
    pushFlowState(stack, b);
    pushFlowState(stack, c);
    const out: FlowState[] = [];
    getFlowStackVisibleStates(stack, out);
    expect(out).toEqual([b, c]);
  });

  it('clears the out array before filling and can be reused', () => {
    const stack = createFlowStack();
    const a = { name: 'A' };
    pushFlowState(stack, a);
    const out: FlowState[] = [{ name: 'stale' }, { name: 'leftover' }];
    getFlowStackVisibleStates(stack, out);
    expect(out).toEqual([a]);
  });

  it('leaves the out array empty for an empty stack', () => {
    const stack = createFlowStack();
    const out: FlowState[] = [{ name: 'stale' }];
    getFlowStackVisibleStates(stack, out);
    expect(out).toEqual([]);
  });
});
