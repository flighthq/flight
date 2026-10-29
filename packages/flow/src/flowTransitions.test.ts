import { describe, expect, it } from 'vitest';

import { createFlowStack, pushFlowState, replaceFlowState } from './flow.ts';
import type { FlowGuardState } from './types.ts';

function guardState(): FlowGuardState {
  return { context: null, enabled: false, transitionDepth: 0 };
}

function failOnEnter(): never {
  throw new Error('onEnter failed');
}

describe('runFlowTransition', () => {
  it('restores transition depth when pushFlowState callbacks throw', () => {
    const guards = guardState();
    expect(() => pushFlowState(createFlowStack(), { onEnter: failOnEnter }, guards)).toThrow('onEnter failed');
    expect(guards.transitionDepth).toBe(0);
  });

  it('restores transition depth when replaceFlowState callbacks throw', () => {
    const guards = guardState();
    expect(() => replaceFlowState(createFlowStack(), { onEnter: failOnEnter }, guards)).toThrow('onEnter failed');
    expect(guards.transitionDepth).toBe(0);
  });
});
