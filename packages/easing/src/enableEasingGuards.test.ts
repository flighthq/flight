import type { LogState } from '@flighthq/log/contract';
import { addLogSink, createLogState, createMemoryLogSink, getMemoryLogSinkEntries } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { easeSteps, setEasingStepsGuard } from './easeSteps.ts';
import { disableEasingGuards, enableEasingGuards } from './enableEasingGuards.ts';

function captureLog(run: (logState: LogState) => void): readonly LogEntry[] {
  const logState = createLogState();
  const sink = createMemoryLogSink(8);
  addLogSink(logState, sink.sink);
  run(logState);
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

function clock(): number {
  return 0;
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

describe('disableEasingGuards', () => {
  it('uninstalls the guard, returning the degenerate call to silence', () => {
    const entries = captureLog((logState) => {
      enableEasingGuards(logState, clock);
      disableEasingGuards();
      // Still NaN — disabling removes the reporting, not the sharp edge.
      expect(Number.isNaN(easeSteps(1, 'jumpNone')(0.5))).toBe(true);
    });
    expect(entries.length).toBe(0);
  });
});

describe('enableEasingGuards', () => {
  it('WARNS on the degenerate jumpNone step count that silently returns NaN', () => {
    const entries = captureLog((logState) => {
      enableEasingGuards(logState, clock);
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
    const guarded = captureLog((logState) => {
      enableEasingGuards(logState, clock);
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

describe('setEasingStepsGuard', () => {
  it('reports the degenerate jumpNone call that silently returns NaN', () => {
    const seen: [number, string][] = [];
    setEasingStepsGuard((count, position) => seen.push([count, position]));
    try {
      expect(Number.isNaN(easeSteps(1, 'jumpNone')(0.5))).toBe(true);
      expect(seen).toEqual([[1, 'jumpNone']]);
    } finally {
      setEasingStepsGuard(null);
    }
  });

  it('stays silent for well-defined calls and once uninstalled', () => {
    const seen: number[] = [];
    setEasingStepsGuard((count) => seen.push(count));
    try {
      easeSteps(2, 'jumpNone')(0.5);
      easeSteps(1, 'jumpEnd')(0.5);
      expect(seen).toEqual([]);
    } finally {
      setEasingStepsGuard(null);
    }

    expect(Number.isNaN(easeSteps(1, 'jumpNone')(0.5))).toBe(true);
    expect(seen).toEqual([]);
  });
});
