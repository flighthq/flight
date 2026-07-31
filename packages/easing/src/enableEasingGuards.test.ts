import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { easeSteps } from './easeSteps';
import { disableEasingGuards, enableEasingGuards } from './enableEasingGuards';

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

describe('disableEasingGuards', () => {
  it('uninstalls the guard, returning the degenerate call to silence', () => {
    const entries = captureLog(() => {
      enableEasingGuards();
      disableEasingGuards();
      // Still NaN — disabling removes the reporting, not the sharp edge.
      expect(Number.isNaN(easeSteps(1, 'jumpNone')(0.5))).toBe(true);
    });
    expect(entries.length).toBe(0);
  });
});

describe('enableEasingGuards', () => {
  it('WARNS on the degenerate jumpNone step count that silently returns NaN', () => {
    const entries = captureLog(() => {
      enableEasingGuards();
      try {
        expect(Number.isNaN(easeSteps(1, 'jumpNone')(0.5))).toBe(true);
      } finally {
        disableEasingGuards();
      }
    });
    expect(entries.length).toBe(1);
    expect(messageOf(entries[0])).toContain('count >= 2');
  });

  it('stays SILENT for well-defined calls, and without the guard at all', () => {
    const guarded = captureLog(() => {
      enableEasingGuards();
      try {
        easeSteps(2, 'jumpNone')(0.5);
        easeSteps(1, 'jumpEnd')(0.5);
        easeSteps(1, 'jumpStart')(0.5);
        easeSteps(1, 'jumpBoth')(0.5);
      } finally {
        disableEasingGuards();
      }
    });
    expect(guarded.length).toBe(0);

    // Production default: still NaN, but nothing is logged — the guard is opt-in.
    const unguarded = captureLog(() => {
      expect(Number.isNaN(easeSteps(1, 'jumpNone')(0.5))).toBe(true);
    });
    expect(unguarded.length).toBe(0);
  });
});
