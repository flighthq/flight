import type { FlowState } from '@flighthq/types';

import {
  clearFlowStack,
  createFlowStack,
  getActiveFlowState,
  getFlowStackDepth,
  getFlowStackVisibleStates,
  popFlowState,
  pushFlowState,
  replaceFlowState,
  updateFlowStack,
} from './flow';

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

describe('pushFlowState', () => {
  it('enters a state pushed onto an empty stack', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    pushFlowState(stack, labeledState('A', log));
    expect(log).toEqual(['A.enter']);
  });

  it('pauses the previous top before entering the new state', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    pushFlowState(stack, labeledState('A', log));
    log.length = 0;
    pushFlowState(stack, labeledState('B', log));
    expect(log).toEqual(['A.pause', 'B.enter']);
    expect(stack.states.length).toBe(2);
  });

  it('does not throw when the states omit lifecycle callbacks', () => {
    const stack = createFlowStack();
    pushFlowState(stack, {});
    expect(() => pushFlowState(stack, {})).not.toThrow();
    expect(stack.states.length).toBe(2);
  });
});

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

describe('updateFlowStack', () => {
  it('ticks only the top with the frame deltaTime', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    pushFlowState(stack, labeledState('A', log));
    pushFlowState(stack, labeledState('B', log));
    log.length = 0;
    updateFlowStack(stack, 0.016);
    expect(log).toEqual(['B.update:0.016']);
  });

  it('ticks the state beneath a transparent updateBelow overlay', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    pushFlowState(stack, labeledState('A', log));
    pushFlowState(stack, labeledState('B', log, { updateBelow: true }));
    log.length = 0;
    updateFlowStack(stack, 0.02);
    expect(log).toEqual(['B.update:0.02', 'A.update:0.02']);
  });

  it('does not tick below an opaque overlay', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    pushFlowState(stack, labeledState('A', log));
    pushFlowState(stack, labeledState('B', log));
    log.length = 0;
    updateFlowStack(stack, 0.01);
    expect(log).toEqual(['B.update:0.01']);
  });

  it('walks a chain of updateBelow overlays and stops at the first opaque one', () => {
    const log: string[] = [];
    const stack = createFlowStack();
    pushFlowState(stack, labeledState('A', log));
    pushFlowState(stack, labeledState('B', log));
    pushFlowState(stack, labeledState('C', log, { updateBelow: true }));
    pushFlowState(stack, labeledState('D', log, { updateBelow: true }));
    log.length = 0;
    updateFlowStack(stack, 0.5);
    expect(log).toEqual(['D.update:0.5', 'C.update:0.5', 'B.update:0.5']);
  });

  it('is a no-op on an empty stack', () => {
    const stack = createFlowStack();
    expect(() => updateFlowStack(stack, 0.016)).not.toThrow();
  });

  it('does not throw when a ticked state omits onUpdate', () => {
    const stack = createFlowStack();
    stack.states.push({ updateBelow: true }, {});
    expect(() => updateFlowStack(stack, 0.016)).not.toThrow();
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
