import type { LogState } from '@flighthq/log/contract';
import {
  addLogSink,
  clearLogChannelLevels,
  clearLogSinks,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  setLogLevel,
} from '@flighthq/log/contract';
import type { LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DebugState } from './debug.ts';
import { createDebugState, disableDebug, enableDebug, isDebugEnabled } from './debug.ts';
import { beginDebugSpan, endDebugSpan, markDebugFrame, measureDebugSpan } from './debugTiming.ts';

function entryData(sink: MemoryLogSink): Readonly<Record<string, unknown>>[] {
  return readLogEntries(sink).map((entry) => (entry as { data: Record<string, unknown> }).data);
}

// Monotonic test clock: each read advances one millisecond, so spans measure a positive duration.
function clock(): number {
  return ++clockMs;
}

function readLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

beforeEach(() => {
  clockMs = 0;
  debugState = createDebugState();
  logState = createLogState();
  if (isDebugEnabled(debugState)) disableDebug(debugState, logState);
  clearLogSinks(logState);
  clearLogChannelLevels(logState);
  setLogLevel(logState, LogLevel.Verbose);
});

afterEach(() => {
  if (isDebugEnabled(debugState)) disableDebug(debugState, logState);
  clearLogSinks(logState);
  clearLogChannelLevels(logState);
  setLogLevel(logState, LogLevel.Verbose);
});

describe('beginDebugSpan', () => {
  it('returns null when debug is disabled', () => {
    expect(beginDebugSpan(debugState, clock(), 'draw')).toBeNull();
  });

  it('returns a running timer when debug is enabled', () => {
    enableDebug(debugState, logState, { sink: createMemoryLogSink(1).sink });
    const timer = beginDebugSpan(debugState, clock(), 'draw');
    expect(timer).not.toBeNull();
    expect(timer!.label).toBe('draw');
  });
});

describe('endDebugSpan', () => {
  it('is a no-op returning -1 for a null timer', () => {
    expect(endDebugSpan(logState, clock(), null)).toBe(-1);
  });

  it('emits an elapsed-time entry and returns the elapsed milliseconds', () => {
    const memory = createMemoryLogSink(16);
    enableDebug(debugState, logState, { sink: memory.sink });
    const timer = beginDebugSpan(debugState, clock(), 'draw');
    const elapsed = endDebugSpan(logState, clock(), timer);
    expect(elapsed).toBe(1);
    const data = entryData(memory);
    expect(data).toHaveLength(1);
    expect(data[0].label).toBe('draw');
    expect(typeof data[0].elapsedMs).toBe('number');
  });
});

describe('markDebugFrame', () => {
  it('is a no-op when debug is disabled', () => {
    const memory = createMemoryLogSink(4);
    addLogSink(logState, memory.sink);
    markDebugFrame(debugState, logState, clock());
    expect(readLogEntries(memory)).toHaveLength(0);
  });

  it('emits a labeled frame marker when debug is enabled', () => {
    const memory = createMemoryLogSink(16);
    enableDebug(debugState, logState, { sink: memory.sink });
    markDebugFrame(debugState, logState, clock(), 'level-load');
    expect(entryData(memory)[0].frame).toBe('level-load');
  });

  it('tags an unlabeled marker with an ascending counter', () => {
    const memory = createMemoryLogSink(16);
    enableDebug(debugState, logState, { sink: memory.sink });
    markDebugFrame(debugState, logState, clock());
    markDebugFrame(debugState, logState, clock());
    const [a, b] = entryData(memory);
    expect(typeof a.frame).toBe('number');
    expect(b.frame as number).toBeGreaterThan(a.frame as number);
  });
});

describe('measureDebugSpan', () => {
  it('returns the wrapped function result', () => {
    expect(measureDebugSpan(debugState, logState, clock, 'compute', () => 42)).toBe(42);
  });

  it('runs the function but emits nothing when debug is disabled', () => {
    const memory = createMemoryLogSink(4);
    addLogSink(logState, memory.sink);
    let ran = false;
    measureDebugSpan(debugState, logState, clock, 'compute', () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(readLogEntries(memory)).toHaveLength(0);
  });

  it('emits one timing entry named for the span when debug is enabled', () => {
    const memory = createMemoryLogSink(16);
    enableDebug(debugState, logState, { sink: memory.sink });
    measureDebugSpan(debugState, logState, clock, 'compute', () => 1);
    const data = entryData(memory);
    expect(data).toHaveLength(1);
    expect(data[0].label).toBe('compute');
  });

  it('closes the span even when the function throws', () => {
    const memory = createMemoryLogSink(16);
    enableDebug(debugState, logState, { sink: memory.sink });
    expect(() =>
      measureDebugSpan(debugState, logState, clock, 'boom', () => {
        throw new Error('nope');
      }),
    ).toThrow('nope');
    expect(entryData(memory)).toHaveLength(1);
  });
});

let clockMs = 0;
let debugState: DebugState = createDebugState();
let logState: LogState = createLogState();
