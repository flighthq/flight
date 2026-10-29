// Generated from crates/flight-flow/tests/flow_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import * as flightEntity from '@flighthq/entity/contract';
import { createLogState } from '@flighthq/log/contract';
import { describe, expect, it } from 'vitest';

import {
  clearFlowStack,
  createFlowStack,
  disableFlowGuards,
  getActiveFlowState,
  getFlowStackDepth,
  getFlowStackVisibleStates,
  initializeFlowStack,
  popFlowState,
  pushFlowState,
  replaceFlowState,
  updateFlowStack,
} from './contract.ts';
import type { FlowGuardContext, FlowGuardState, FlowGuardStateRef, FlowState } from './contract.ts';

function guardState(): FlowGuardStateRef {
  const state = { enabled: false, transitionDepth: 0, context: { logState: createLogState(), clock: () => 0.0 } };
  disableFlowGuards(state);
  return state;
}

function state(state: FlowState): FlowState {
  return state;
}

function labeledState(name: string, log: Readonly<Readonly<{ value: string[] }>>): FlowState {
  const enterName = String(name);
  const exitName = String(name);
  const pauseName = String(name);
  const resumeName = String(name);
  const updateName = String(name);
  const enterLog = log;
  const exitLog = log;
  const pauseLog = log;
  const resumeLog = log;
  const updateLog = log;
  return state({
    name: String(name),
    onEnter: () => {
      enterLog.value.push(`${enterName}.enter`);
    },
    onExit: () => {
      exitLog.value.push(`${exitName}.exit`);
    },
    onPause: () => {
      pauseLog.value.push(`${pauseName}.pause`);
    },
    onResume: () => {
      resumeLog.value.push(`${resumeName}.resume`);
    },
    onUpdate: (dt: number) => {
      updateLog.value.push(`${updateName}.update:${dt}`);
    },
    renderBelow: undefined,
    updateBelow: undefined,
  });
}

function plain(name: string): FlowState {
  return state({
    name: String(name),
    onEnter: undefined,
    onExit: undefined,
    onPause: undefined,
    onResume: undefined,
    onUpdate: undefined,
    renderBelow: undefined,
    updateBelow: undefined,
  });
}

function takeOnce(slot: Readonly<Readonly<{ value: boolean[] }>>): boolean {
  let values = slot.value;
  if (values.length !== 0) {
    return false;
  }
  values.push(true);
  return true;
}

describe('clearFlowStack', () => {
  it('exits every state top to bottom and empties the stack', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    pushFlowState(stack, labeledState('B', log), guards);
    pushFlowState(stack, labeledState('C', log), guards);
    log.value.length = 0;
    clearFlowStack(stack);
    expect(log.value).toEqual(['C.exit', 'B.exit', 'A.exit']);
    expect(getFlowStackDepth(stack)).toEqual(0);
  });
  it('is a no op on an empty stack', () => {
    const stack = createFlowStack();
    clearFlowStack(stack);
    expect(getFlowStackDepth(stack)).toEqual(0);
  });
  it('exits while the states are still on the stack', () => {
    const stack = createFlowStack();
    const guards = guardState();
    const seen: Readonly<{ value: number[] }> = { value: [] as never[] };
    for (const name of ['A', 'B']) {
      const observer = stack;
      const depths = seen;
      pushFlowState(
        stack,
        state({
          name: String(name),
          onEnter: undefined,
          onExit: () => {
            depths.value.push(getFlowStackDepth(observer));
          },
          onPause: undefined,
          onResume: undefined,
          onUpdate: undefined,
          renderBelow: undefined,
          updateBelow: undefined,
        }),
        guards,
      );
    }
    clearFlowStack(stack);
    expect(seen.value).toEqual([2, 2]);
    expect(getFlowStackDepth(stack)).toEqual(0);
  });
});

describe('createFlowStack', () => {
  it('allocates an empty stack', () => {
    const stack = createFlowStack();
    expect(getFlowStackDepth(stack)).toEqual(0);
  });
  it('allocates a fresh independent stack each call', () => {
    const a = createFlowStack();
    const b = createFlowStack();
    const guards = guardState();
    pushFlowState(a, plain('A'), guards);
    expect(getFlowStackDepth(b)).toEqual(0);
  });
  it('allocates an entity with an empty runtime slot', () => {
    const stack = createFlowStack();
    expect(!flightEntity.hasEntityRuntime(stack!)).toBe(true);
  });
});

describe('getActiveFlowState', () => {
  it('returns the top of the stack', () => {
    const stack = createFlowStack();
    const guards = guardState();
    const b = plain('B');
    pushFlowState(stack, plain('A'), guards);
    pushFlowState(stack, b, guards);
    expect(getActiveFlowState(stack)! === b).toBe(true);
  });
  it('returns none on an empty stack', () => {
    const stack = createFlowStack();
    const fallback = plain('fallback');
    const active = getActiveFlowState(stack) ?? fallback;
    expect(active === fallback).toBe(true);
  });
});

describe('getFlowStackDepth', () => {
  it('counts the states on the stack', () => {
    const stack = createFlowStack();
    const guards = guardState();
    expect(getFlowStackDepth(stack)).toEqual(0);
    pushFlowState(stack, plain('A'), guards);
    pushFlowState(stack, plain('B'), guards);
    expect(getFlowStackDepth(stack)).toEqual(2);
    popFlowState(stack);
    expect(getFlowStackDepth(stack)).toEqual(1);
  });
});

describe('getFlowStackVisibleStates', () => {
  it('fills only the top when it is opaque', () => {
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, plain('A'), guards);
    const b = plain('B');
    pushFlowState(stack, b, guards);
    let out = [] as never[];
    getFlowStackVisibleStates(out, stack);
    expect(out.length).toEqual(1);
    expect(out[0] === b).toBe(true);
  });
  it('includes the contiguous render below run bottom to top', () => {
    const stack = createFlowStack();
    const guards = guardState();
    const a = plain('A');
    let b: FlowState = {
      name: 'B',
      onEnter: undefined,
      onExit: undefined,
      onPause: undefined,
      onResume: undefined,
      onUpdate: undefined,
      renderBelow: true,
      updateBelow: undefined,
    };
    b.renderBelow = true;
    b = state(b);
    let c: FlowState = {
      name: 'C',
      onEnter: undefined,
      onExit: undefined,
      onPause: undefined,
      onResume: undefined,
      onUpdate: undefined,
      renderBelow: true,
      updateBelow: undefined,
    };
    c.renderBelow = true;
    c = state(c);
    pushFlowState(stack, a, guards);
    pushFlowState(stack, b, guards);
    pushFlowState(stack, c, guards);
    let out = [] as never[];
    getFlowStackVisibleStates(out, stack);
    expect(out.length).toEqual(3);
    expect(out[0] === a).toBe(true);
    expect(out[1] === b).toBe(true);
    expect(out[2] === c).toBe(true);
  });
  it('stops at the first opaque state below a translucent overlay', () => {
    const stack = createFlowStack();
    const guards = guardState();
    const b = plain('B');
    const c = state({
      name: 'C',
      onEnter: undefined,
      onExit: undefined,
      onPause: undefined,
      onResume: undefined,
      onUpdate: undefined,
      renderBelow: true,
      updateBelow: undefined,
    });
    pushFlowState(stack, plain('A'), guards);
    pushFlowState(stack, b, guards);
    pushFlowState(stack, c, guards);
    let out = [] as never[];
    getFlowStackVisibleStates(out, stack);
    expect(out.length).toEqual(2);
    expect(out[0] === b).toBe(true);
    expect(out[1] === c).toBe(true);
  });
  it('clears the out list before filling and can be reused', () => {
    const stack = createFlowStack();
    const guards = guardState();
    const a = plain('A');
    pushFlowState(stack, a, guards);
    const stale = plain('stale');
    let out = [stale, stale];
    getFlowStackVisibleStates(out, stack);
    expect(out.length).toEqual(1);
    expect(out[0] === a).toBe(true);
  });
  it('leaves the out list empty for an empty stack', () => {
    const stack = createFlowStack();
    const stale = plain('stale');
    let out = [stale];
    getFlowStackVisibleStates(out, stack);
    expect(out.length === 0).toBe(true);
  });
});

describe('initializeFlowStack', () => {
  it('is the construction initializer of create flow stack', () => {
    const stack = createFlowStack();
    stack!.states.push(plain('stale'));
    initializeFlowStack(stack!);
    expect(stack!.states.length === 0).toBe(true);
  });
});

describe('popFlowState', () => {
  it('exits the top and resumes the revealed state returning the popped state', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    const b = labeledState('B', log);
    pushFlowState(stack, b, guards);
    log.value.length = 0;
    const popped = popFlowState(stack)!;
    expect(log.value).toEqual(['B.exit', 'A.resume']);
    expect(popped === b).toBe(true);
    expect(getFlowStackDepth(stack)).toEqual(1);
  });
  it('returns none when the stack is empty', () => {
    const stack = createFlowStack();
    const fallback = plain('fallback');
    const popped = popFlowState(stack) ?? fallback;
    expect(popped === fallback).toBe(true);
  });
  it('exits the last state without resuming anything below', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    log.value.length = 0;
    popFlowState(stack);
    expect(log.value).toEqual(['A.exit']);
  });
  it('does not panic when the popped state omits callbacks', () => {
    const stack = createFlowStack();
    stack!.states.push(plain('A'));
    expect(popFlowState(stack) !== undefined).toBe(true);
  });
});

describe('pushFlowState', () => {
  it('enters a state pushed onto an empty stack', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    expect(log.value).toEqual(['A.enter']);
  });
  it('pauses the previous top before entering the new state', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    log.value.length = 0;
    pushFlowState(stack, labeledState('B', log), guards);
    expect(log.value).toEqual(['A.pause', 'B.enter']);
    expect(getFlowStackDepth(stack)).toEqual(2);
  });
  it('does not panic when the states omit lifecycle callbacks', () => {
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, plain('A'), guards);
    pushFlowState(stack, plain('B'), guards);
    expect(getFlowStackDepth(stack)).toEqual(2);
  });
  it('supports a real reentrant push from on enter', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    const nestedLog = log;
    const nestedStack = stack;
    const nestedGuards = guards;
    let a: FlowState = {
      name: 'A',
      onEnter: undefined,
      onExit: undefined,
      onPause: undefined,
      onResume: undefined,
      onUpdate: undefined,
      renderBelow: undefined,
      updateBelow: undefined,
    };
    a.onEnter = () => {
      nestedLog.value.push('A.enter');
      const b = state({
        name: 'B',
        onEnter: (() => {
          const inner = nestedLog;
          return () => inner.value.push('B.enter');
        })(),
        onExit: undefined,
        onPause: undefined,
        onResume: undefined,
        onUpdate: undefined,
        renderBelow: undefined,
        updateBelow: undefined,
      });
      pushFlowState(nestedStack, b, nestedGuards);
    };
    pushFlowState(stack, state(a), guards);
    expect(log.value).toEqual(['A.enter', 'B.enter']);
    expect(getFlowStackDepth(stack)).toEqual(2);
    expect(guards!.transitionDepth).toEqual(0);
  });
  it('supports a real reentrant push from on pause', () => {
    const stack = createFlowStack();
    const guards = guardState();
    const stackForPause = stack;
    const guardsForPause = guards;
    const pausedOnce: Readonly<{ value: boolean[] }> = { value: [] as never[] };
    const pausedOnceSlot = pausedOnce;
    let a: FlowState = {
      name: 'A',
      onEnter: undefined,
      onExit: undefined,
      onPause: undefined,
      onResume: undefined,
      onUpdate: undefined,
      renderBelow: undefined,
      updateBelow: undefined,
    };
    a.onPause = () => {
      if (takeOnce(pausedOnceSlot)) {
        pushFlowState(stackForPause, plain('C'), guardsForPause);
      }
    };
    pushFlowState(stack, state(a), guards);
    pushFlowState(stack, plain('B'), guards);
    const states = stack!;
    expect(states.states.length).toEqual(3);
    expect(states.states[0]!.name).toEqual('A');
    expect(states.states[1]!.name).toEqual('C');
    expect(states.states[2]!.name).toEqual('B');
    expect(guards!.transitionDepth).toEqual(0);
  });
});

describe('replaceFlowState', () => {
  it('exits the top and enters the replacement without touching the state below', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    const a = labeledState('A', log);
    pushFlowState(stack, a, guards);
    pushFlowState(stack, labeledState('B', log), guards);
    log.value.length = 0;
    replaceFlowState(stack, labeledState('C', log), guards);
    expect(log.value).toEqual(['B.exit', 'C.enter']);
    expect(getFlowStackDepth(stack)).toEqual(2);
    expect(stack!.states[0] === a).toBe(true);
  });
  it('just pushes and enters on an empty stack', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    replaceFlowState(stack, labeledState('C', log), guards);
    expect(log.value).toEqual(['C.enter']);
    expect(getFlowStackDepth(stack)).toEqual(1);
  });
  it('does not panic when the states omit callbacks', () => {
    const stack = createFlowStack();
    stack!.states.push(plain('A'));
    const guards = guardState();
    replaceFlowState(stack, plain('B'), guards);
    expect(getFlowStackDepth(stack)).toEqual(1);
  });
});

describe('updateFlowStack', () => {
  it('ticks only the top with the frame delta time', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    pushFlowState(stack, labeledState('B', log), guards);
    log.value.length = 0;
    updateFlowStack(stack, 0.016);
    expect(log.value).toEqual(['B.update:0.016']);
  });
  it('ticks the state beneath a transparent update below overlay', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    let b = labeledState('B', log)!;
    b.updateBelow = true;
    pushFlowState(stack, state(b), guards);
    log.value.length = 0;
    updateFlowStack(stack, 0.02);
    expect(log.value).toEqual(['B.update:0.02', 'A.update:0.02']);
  });
  it('does not tick below an opaque overlay', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    pushFlowState(stack, labeledState('B', log), guards);
    log.value.length = 0;
    updateFlowStack(stack, 0.01);
    expect(log.value).toEqual(['B.update:0.01']);
  });
  it('walks a chain of update below overlays and stops at the first opaque one', () => {
    const log: Readonly<{ value: string[] }> = { value: [] as never[] };
    const stack = createFlowStack();
    const guards = guardState();
    pushFlowState(stack, labeledState('A', log), guards);
    pushFlowState(stack, labeledState('B', log), guards);
    let c = labeledState('C', log)!;
    c.updateBelow = true;
    pushFlowState(stack, state(c), guards);
    let d = labeledState('D', log)!;
    d.updateBelow = true;
    pushFlowState(stack, state(d), guards);
    log.value.length = 0;
    updateFlowStack(stack, 0.5);
    expect(log.value).toEqual(['D.update:0.5', 'C.update:0.5', 'B.update:0.5']);
  });
  it('is a no op on an empty stack', () => {
    const stack = createFlowStack();
    updateFlowStack(stack, 0.016);
  });
  it('does not panic when a ticked state omits on update', () => {
    const stack = createFlowStack();
    stack!.states.push(
      state({
        name: 'lower',
        onEnter: undefined,
        onExit: undefined,
        onPause: undefined,
        onResume: undefined,
        onUpdate: undefined,
        renderBelow: undefined,
        updateBelow: true,
      }),
    );
    stack!.states.push(plain('top'));
    updateFlowStack(stack, 0.016);
  });
});
