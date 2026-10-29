// Generated from crates/flight-flow/tests/flow_guards_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { addLogSink, createJsonLogFormatter, createLogState } from '@flighthq/log/contract';
import type { LogStateRaw } from '@flighthq/log/contract';
import { describe, expect, it } from 'vitest';

import {
  createFlowStack,
  disableFlowGuards,
  enableFlowGuards,
  getFlowGuardKindString,
  parseFlowGuardKind,
  pushFlowState,
  reportFlowGuard,
} from './contract.ts';
import type { FlowGuardContext, FlowGuardState, FlowGuardStateRef, FlowState } from './contract.ts';

function guardState(): FlowGuardStateRef {
  const state = { enabled: false, transitionDepth: 0, context: { logState: logState(), clock: () => 0.0 } };
  disableFlowGuards(state);
  return state;
}

function logState(): LogStateRaw {
  return createLogState();
}

function captureFormattedEntries(state: LogStateRaw): { value: string[] } {
  const entries: { value: string[] } = { value: [] as never[] };
  const captured = entries;
  const formatter = createJsonLogFormatter(state);
  addLogSink(state, (entry) => {
    captured.value.push(formatter(entry));
  });
  return entries;
}

function plain(name: string): FlowState {
  return {
    name: String(name),
    onEnter: undefined,
    onExit: undefined,
    onPause: undefined,
    onResume: undefined,
    onUpdate: undefined,
    renderBelow: undefined,
    updateBelow: undefined,
  };
}

describe('disableFlowGuards', () => {
  it('is idempotent', () => {
    const guards = guardState();
    disableFlowGuards(guards);
    disableFlowGuards(guards);
    expect(!guards!.enabled).toBe(true);
  });
});

describe('enableFlowGuards', () => {
  it('toggles the opt in guard and captures the enable time context', () => {
    const guards = guardState();
    const state = logState();
    enableFlowGuards(guards, state, () => 0.0);
    expect(guards!.enabled).toBe(true);
    expect(guards!.context !== null).toBe(true);
    disableFlowGuards(guards);
    expect(!guards!.enabled).toBe(true);
  });
});

describe('getFlowGuardKindString', () => {
  it('returns the exact ts string for each kind', () => {
    expect(getFlowGuardKindString('duplicate-state-push')).toEqual('duplicate-state-push');
    expect(getFlowGuardKindString('transition-during-transition')).toEqual('transition-during-transition');
  });
});

describe('parseFlowGuardKind', () => {
  it('parses the exact ts strings and returns none for unknown names', () => {
    expect(parseFlowGuardKind('duplicate-state-push')).toEqual('duplicate-state-push');
    expect(parseFlowGuardKind('transition-during-transition')).toEqual('transition-during-transition');
    expect(parseFlowGuardKind('nope') ?? 'duplicate-state-push').toEqual('duplicate-state-push');
  });
});

describe('reportFlowGuard', () => {
  it('logs a warn entry with the exact kind string and live clock time when enabled', () => {
    const guards = guardState();
    const state = logState();
    enableFlowGuards(guards, state, () => 42.0);
    const captured = captureFormattedEntries(state);
    reportFlowGuard(guards, 'duplicate-state-push');
    const entries = captured.value;
    expect(entries.length).toEqual(1);
    expect(entries[0].includes('"t":42')).toBe(true);
    expect(entries[0].includes('"level":"warn"')).toBe(true);
    expect(entries[0].includes('"channel":"flow"')).toBe(true);
    expect(entries[0].includes('"kind":"duplicate-state-push"')).toBe(true);
  });
  it('is a no op when guards are disabled', () => {
    const guards = guardState();
    const state = logState();
    const captured = captureFormattedEntries(state);
    reportFlowGuard(guards, 'transition-during-transition');
    expect(captured.value.length === 0).toBe(true);
  });
  it('transition during transition is reported when the guard depth is already positive', () => {
    const guards = guardState();
    const state = logState();
    enableFlowGuards(guards, state, () => 3.0);
    guards!.transitionDepth = 1;
    const captured = captureFormattedEntries(state);
    const stack = createFlowStack();
    pushFlowState(stack, plain('A'), guards);
    const entries = captured.value;
    expect(entries.length).toEqual(1);
    expect(entries[0].includes('"t":3')).toBe(true);
    expect(entries[0].includes('"kind":"transition-during-transition"')).toBe(true);
    expect(guards!.transitionDepth).toEqual(1);
  });
  it('duplicate state push is reported by shared state identity', () => {
    const guards = guardState();
    const state = logState();
    enableFlowGuards(guards, state, () => 0.0);
    const captured = captureFormattedEntries(state);
    const stack = createFlowStack();
    const a = plain('A');
    pushFlowState(stack, a, guards);
    pushFlowState(stack, a, guards);
    const entries = captured.value;
    expect(entries.length).toEqual(1);
    expect(entries[0].includes('"kind":"duplicate-state-push"')).toBe(true);
  });
  it('equal but distinct states are not a duplicate', () => {
    const guards = guardState();
    const state = logState();
    enableFlowGuards(guards, state, () => 0.0);
    const captured = captureFormattedEntries(state);
    const stack = createFlowStack();
    pushFlowState(stack, plain('A'), guards);
    pushFlowState(stack, plain('A'), guards);
    expect(captured.value.length === 0).toBe(true);
  });
});
