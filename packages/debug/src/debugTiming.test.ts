// Generated from crates/flight-debug/tests/debug_timing_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  addLogSink,
  createJsonLogFormatter,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  setLogLevel,
} from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/log/contract';
import type { LogEntry, LogStateRef } from '@flighthq/log/contract';
import { describe, expect, it } from 'vitest';

import {
  beginDebugSpan,
  createDebugState,
  enableDebug,
  endDebugSpan,
  isDebugEnabled,
  markDebugFrame,
  measureDebugSpan,
} from './contract.ts';
import type { DebugState } from './debug.ts';

function steppingClock(): () => number {
  const reads = { value: 0 >>> 0 };
  const clockReads = reads;
  return () =>
    (() => {
      const previous = clockReads.value;
      clockReads.value = (clockReads.value + 1) >>> 0;
      return previous;
    })() * 2.5;
}

function states(): readonly [DebugState, LogStateRef] {
  const logState: LogStateRef = createLogState();
  setLogLevel(logState, LogLevel.Verbose);
  return [createDebugState(), logState];
}

describe('beginDebugSpan', () => {
  it('returns null when debug is disabled', () => {
    const [state] = states();
    expect(beginDebugSpan(state, 0.0, 'draw', null) === null).toBe(true);
  });
  it('returns a running timer when debug is enabled', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(1);
    enableDebug(state, logState, { channels: undefined, level: undefined, sink: memory.sink, subsystems: undefined });
    const timer = beginDebugSpan(state, 0.0, 'draw', null);
    if (timer !== null) {
      expect(timer.label).toEqual('draw');
    } else {
      expect(false, `a timer`).toBe(true);
    }
  });
});

describe('endDebugSpan', () => {
  it('is a no op returning minus one for a null timer', () => {
    const [, logState] = states();
    expect(endDebugSpan(logState, 0.0, null)).toEqual(-1.0);
  });
  it('emits an elapsed time entry and returns the elapsed milliseconds', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(16);
    enableDebug(state, logState, { channels: undefined, level: undefined, sink: memory.sink, subsystems: undefined });
    const timer = beginDebugSpan(state, 5.0, 'draw', null);
    const elapsed = endDebugSpan(logState, 7.5, timer ?? null);
    expect(elapsed).toEqual(2.5);
    let logged: LogEntry[] = [] as never[];
    getMemoryLogSinkEntries(logged, memory);
    expect(logged.length).toEqual(1);
    const formatted = createJsonLogFormatter(logState)(logged[0]);
    expect(formatted.includes('"label":"draw"')).toBe(true);
    expect(formatted.includes('"elapsedMs":2.5')).toBe(true);
  });
});

describe('markDebugFrame', () => {
  it('is a no op when debug is disabled', () => {
    let [state, logState] = states();
    const memory = createMemoryLogSink(4);
    addLogSink(logState, memory.sink);
    markDebugFrame(state, logState, 0.0, undefined, null);
    let logged: LogEntry[] = [] as never[];
    getMemoryLogSinkEntries(logged, memory);
    expect(logged.length === 0).toBe(true);
  });
  it('emits a labeled frame marker when debug is enabled', () => {
    let [state, logState] = states();
    const memory = createMemoryLogSink(16);
    enableDebug(state, logState, { channels: undefined, level: undefined, sink: memory.sink, subsystems: undefined });
    markDebugFrame(state, logState, 0.0, 'level-load', null);
    let logged: LogEntry[] = [] as never[];
    getMemoryLogSinkEntries(logged, memory);
    const formatted = createJsonLogFormatter(logState)(logged[0]);
    expect(formatted.includes('"frame":"level-load"')).toBe(true);
  });
  it('tags an unlabeled marker with an ascending counter', () => {
    let [state, logState] = states();
    const memory = createMemoryLogSink(16);
    enableDebug(state, logState, { channels: undefined, level: undefined, sink: memory.sink, subsystems: undefined });
    markDebugFrame(state, logState, 0.0, undefined, null);
    markDebugFrame(state, logState, 0.0, undefined, null);
    let logged: LogEntry[] = [] as never[];
    getMemoryLogSinkEntries(logged, memory);
    const format = createJsonLogFormatter(logState);
    expect(format(logged[0]).includes('"frame":1')).toBe(true);
    expect(format(logged[1]).includes('"frame":2')).toBe(true);
  });
});

describe('measureDebugSpan', () => {
  it('returns the wrapped function result', () => {
    const [state, logState] = states();
    const reads = { value: 0 >>> 0 };
    const clockReads = reads;
    const clock: () => number = () =>
      (() => {
        const previous = clockReads.value;
        clockReads.value = (clockReads.value + 1) >>> 0;
        return previous;
      })() * 2.5;
    let calls = 0;
    expect(
      measureDebugSpan(
        state,
        logState,
        clock,
        'compute',
        () => {
          calls += 1;
          return 42;
        },
        null,
      ),
    ).toEqual(42);
    expect(calls).toEqual(1);
    expect(
      (() => {
        const previous = reads.value;
        reads.value = (reads.value + 0) >>> 0;
        return previous;
      })(),
    ).toEqual(1);
  });
  it('runs the function but emits nothing when debug is disabled', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(4);
    addLogSink(logState, memory.sink);
    let ran = false;
    measureDebugSpan(state, logState, steppingClock(), 'compute', () => (ran = true), null);
    expect(ran).toBe(true);
    let logged: LogEntry[] = [] as never[];
    getMemoryLogSinkEntries(logged, memory);
    expect(logged.length === 0).toBe(true);
  });
  it('emits one timing entry named for the span when debug is enabled', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(16);
    enableDebug(state, logState, { channels: undefined, level: undefined, sink: memory.sink, subsystems: undefined });
    const reads = { value: 0 >>> 0 };
    const clockReads = reads;
    const clock: () => number = () =>
      (() => {
        const previous = clockReads.value;
        clockReads.value = (clockReads.value + 1) >>> 0;
        return previous;
      })() * 2.5;
    let calls = 0;
    measureDebugSpan(
      state,
      logState,
      clock,
      'compute',
      () => {
        calls += 1;
        return 1;
      },
      null,
    );
    let logged: LogEntry[] = [] as never[];
    getMemoryLogSinkEntries(logged, memory);
    expect(calls).toEqual(1);
    expect(
      (() => {
        const previous = reads.value;
        reads.value = (reads.value + 0) >>> 0;
        return previous;
      })(),
    ).toEqual(2);
    expect(logged.length).toEqual(1);
    const formatted = createJsonLogFormatter(logState)(logged[0]);
    expect(formatted.includes('"label":"compute"')).toBe(true);
    expect(formatted.includes('"elapsedMs":2.5')).toBe(true);
  });
  it('passes an explicit channel', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(16);
    enableDebug(state, logState, { channels: undefined, level: undefined, sink: memory.sink, subsystems: undefined });
    const clock = steppingClock();
    measureDebugSpan(state, logState, clock, 'named-channel', () => 0, 'profile');
    let logged: LogEntry[] = [] as never[];
    getMemoryLogSinkEntries(logged, memory);
    expect(logged[0].channel).toEqual('profile');
  });
  it('closes the span even when the function throws', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(16);
    enableDebug(state, logState, { channels: undefined, level: undefined, sink: memory.sink, subsystems: undefined });
    const reads = { value: 0 >>> 0 };
    const clockReads = reads;
    const clock: () => number = () =>
      (() => {
        const previous = clockReads.value;
        clockReads.value = (clockReads.value + 1) >>> 0;
        return previous;
      })() * 2.5;
    let calls = 0;
    expect(() => {
      return measureDebugSpan(
        state,
        logState,
        clock,
        'boom',
        (): number => {
          calls += 1;
          return (() => {
            throw new Error(`nope`);
          })();
        },
        null,
      );
    }).toThrow(new Error('nope'));
    expect(calls).toEqual(1);
    expect(
      (() => {
        const previous = reads.value;
        reads.value = (reads.value + 0) >>> 0;
        return previous;
      })(),
    ).toEqual(2);
    let logged: LogEntry[] = [] as never[];
    getMemoryLogSinkEntries(logged, memory);
    expect(logged.length).toEqual(1);
    expect(isDebugEnabled(state)).toBe(true);
    expect(measureDebugSpan(state, logState, clock, 'after', () => 7, null)).toEqual(7);
    expect(
      (() => {
        const previous = reads.value;
        reads.value = (reads.value + 0) >>> 0;
        return previous;
      })(),
    ).toEqual(4);
    getMemoryLogSinkEntries(logged, memory);
    expect(logged.length).toEqual(2);
    expect(isDebugEnabled(state)).toBe(true);
  });
});
