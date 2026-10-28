import { addLogSink, createLogState, createMemoryLogSink, getMemoryLogSinkEntries } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import type { LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createFlowStack, pushFlowState } from './flow.ts';
import {
  disableFlowGuards,
  enableFlowGuards,
  getFlowGuardKindString,
  parseFlowGuardKind,
  reportFlowGuard,
} from './flowGuards.ts';
import type { FlowGuardState } from './types.ts';

describe('disableFlowGuards', () => {
  it('is idempotent and drops the enable-time context', () => {
    const guards = guardState();
    enableFlowGuards(guards, createLogState(), () => 0);
    disableFlowGuards(guards);
    disableFlowGuards(guards);
    expect(guards.enabled).toBe(false);
    expect(guards.context).toBeNull();
  });
});

describe('enableFlowGuards', () => {
  it('toggles the opt-in guard and captures the enable-time context', () => {
    const guards = guardState();
    const logState = createLogState();
    const clock = (): number => 7;
    enableFlowGuards(guards, logState, clock);
    expect(guards.enabled).toBe(true);
    expect(guards.context?.logState).toBe(logState);
    expect(guards.context?.clock).toBe(clock);
  });
});

describe('getFlowGuardKindString', () => {
  it('returns the exact string for each kind', () => {
    expect(getFlowGuardKindString('duplicate-state-push')).toBe('duplicate-state-push');
    expect(getFlowGuardKindString('transition-during-transition')).toBe('transition-during-transition');
  });
});

describe('parseFlowGuardKind', () => {
  it('parses the exact strings and returns null for unknown names', () => {
    expect(parseFlowGuardKind('duplicate-state-push')).toBe('duplicate-state-push');
    expect(parseFlowGuardKind('transition-during-transition')).toBe('transition-during-transition');
    expect(parseFlowGuardKind('duplicateStatePush')).toBeNull();
    expect(parseFlowGuardKind('')).toBeNull();
  });
});

describe('reportFlowGuard', () => {
  it('logs a warn entry with the exact kind string and live clock time when enabled', () => {
    const { guards, logState, memory } = enabledGuards();
    let now = 41;
    enableFlowGuards(guards, logState, () => ++now);
    reportFlowGuard(guards, 'duplicate-state-push');
    const entries = readEntries(memory);
    expect(entries).toEqual([
      {
        level: LogLevel.Warn,
        channel: 'flow',
        data: { kind: 'duplicate-state-push' },
        timestampMs: 42,
      },
    ]);
  });

  it('is a no-op when guards are disabled', () => {
    const { guards, memory } = enabledGuards();
    disableFlowGuards(guards);
    reportFlowGuard(guards, 'duplicate-state-push');
    expect(readEntries(memory)).toEqual([]);
  });

  it('reports transition-during-transition when the guard depth is already positive', () => {
    const { guards, memory } = enabledGuards();
    const stack = createFlowStack();
    pushFlowState(stack, { onEnter: () => pushFlowState(stack, {}, guards) }, guards);
    expect(readEntries(memory).map((entry) => (entry.data as { kind: string }).kind)).toEqual([
      'transition-during-transition',
    ]);
    expect(guards.transitionDepth).toBe(0);
  });

  it('reports duplicate-state-push by state identity', () => {
    const { guards, memory } = enabledGuards();
    const stack = createFlowStack();
    const state = {};
    pushFlowState(stack, state, guards);
    pushFlowState(stack, state, guards);
    expect(readEntries(memory).map((entry) => (entry.data as { kind: string }).kind)).toEqual(['duplicate-state-push']);
  });

  it('does not treat equal but distinct states as a duplicate', () => {
    const { guards, memory } = enabledGuards();
    const stack = createFlowStack();
    pushFlowState(stack, { name: 'same' }, guards);
    pushFlowState(stack, { name: 'same' }, guards);
    expect(readEntries(memory)).toEqual([]);
  });
});

function enabledGuards(): { guards: FlowGuardState; logState: LogState; memory: MemoryLogSink } {
  const guards = guardState();
  const logState = createLogState();
  const memory = createMemoryLogSink(16);
  addLogSink(logState, memory.sink);
  enableFlowGuards(guards, logState, () => 0);
  return { guards, logState, memory };
}

function guardState(): FlowGuardState {
  return { enabled: false, transitionDepth: 0, context: null };
}

function readEntries(memory: MemoryLogSink): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, memory);
  return entries;
}
