import {
  addLogSink,
  clearLogChannelLevels,
  clearLogSinks,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  setLogLevel,
} from '@flighthq/log';
import type { MemoryLogSink } from '@flighthq/log';
import { LogLevel } from '@flighthq/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { disableDebug, enableDebug, isDebugEnabled } from './debug';
import { beginDebugSpan, endDebugSpan, markDebugFrame, measureDebugSpan } from './debugTiming';

function entryData(sink: MemoryLogSink): Readonly<Record<string, unknown>>[] {
  return getMemoryLogSinkEntries(sink).map((entry) => (entry as { data: Record<string, unknown> }).data);
}

beforeEach(() => {
  if (isDebugEnabled()) disableDebug();
  clearLogSinks();
  clearLogChannelLevels();
  setLogLevel(LogLevel.Verbose);
});

afterEach(() => {
  if (isDebugEnabled()) disableDebug();
  clearLogSinks();
  clearLogChannelLevels();
  setLogLevel(LogLevel.Verbose);
});

describe('beginDebugSpan', () => {
  it('returns null when debug is disabled', () => {
    expect(beginDebugSpan('draw')).toBeNull();
  });

  it('returns a running timer when debug is enabled', () => {
    enableDebug({ sink: createMemoryLogSink(1).sink });
    const timer = beginDebugSpan('draw');
    expect(timer).not.toBeNull();
    expect(timer!.label).toBe('draw');
  });
});

describe('endDebugSpan', () => {
  it('is a no-op returning -1 for a null timer', () => {
    expect(endDebugSpan(null)).toBe(-1);
  });

  it('emits an elapsed-time entry and returns the elapsed milliseconds', () => {
    const memory = createMemoryLogSink(16);
    enableDebug({ sink: memory.sink });
    const elapsed = endDebugSpan(beginDebugSpan('draw'));
    expect(elapsed).toBeGreaterThanOrEqual(0);
    const data = entryData(memory);
    expect(data).toHaveLength(1);
    expect(data[0].label).toBe('draw');
    expect(typeof data[0].elapsedMs).toBe('number');
  });
});

describe('markDebugFrame', () => {
  it('is a no-op when debug is disabled', () => {
    const memory = createMemoryLogSink(4);
    addLogSink(memory.sink);
    markDebugFrame();
    expect(getMemoryLogSinkEntries(memory)).toHaveLength(0);
  });

  it('emits a labeled frame marker when debug is enabled', () => {
    const memory = createMemoryLogSink(16);
    enableDebug({ sink: memory.sink });
    markDebugFrame('level-load');
    expect(entryData(memory)[0].frame).toBe('level-load');
  });

  it('tags an unlabeled marker with an ascending counter', () => {
    const memory = createMemoryLogSink(16);
    enableDebug({ sink: memory.sink });
    markDebugFrame();
    markDebugFrame();
    const [a, b] = entryData(memory);
    expect(typeof a.frame).toBe('number');
    expect(b.frame as number).toBeGreaterThan(a.frame as number);
  });
});

describe('measureDebugSpan', () => {
  it('returns the wrapped function result', () => {
    expect(measureDebugSpan('compute', () => 42)).toBe(42);
  });

  it('runs the function but emits nothing when debug is disabled', () => {
    const memory = createMemoryLogSink(4);
    addLogSink(memory.sink);
    let ran = false;
    measureDebugSpan('compute', () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(getMemoryLogSinkEntries(memory)).toHaveLength(0);
  });

  it('emits one timing entry named for the span when debug is enabled', () => {
    const memory = createMemoryLogSink(16);
    enableDebug({ sink: memory.sink });
    measureDebugSpan('compute', () => 1);
    const data = entryData(memory);
    expect(data).toHaveLength(1);
    expect(data[0].label).toBe('compute');
  });

  it('closes the span even when the function throws', () => {
    const memory = createMemoryLogSink(16);
    enableDebug({ sink: memory.sink });
    expect(() =>
      measureDebugSpan('boom', () => {
        throw new Error('nope');
      }),
    ).toThrow('nope');
    expect(entryData(memory)).toHaveLength(1);
  });
});
