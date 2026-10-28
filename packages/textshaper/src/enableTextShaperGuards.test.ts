import type { LogState } from '@flighthq/log/contract';
import { addLogSink, createLogState, createMemoryLogSink, getMemoryLogSinkEntries } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { disableTextShaperGuards, enableTextShaperGuards } from './enableTextShaperGuards.ts';
import { acquireShapedRun, releaseShapedRun } from './textShaperPool.ts';

let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(logState, sink.sink);
  run();
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

describe('disableTextShaperGuards', () => {
  it('stops repeated releases from reporting', () => {
    const entries = captureLog(() => {
      enableTextShaperGuards(logState, () => 0);
      disableTextShaperGuards();
      const run = acquireShapedRun();
      releaseShapedRun(run);
      releaseShapedRun(run);
    });
    expect(entries).toEqual([]);
  });
});

describe('enableTextShaperGuards', () => {
  it('warns when one acquired run is released twice', () => {
    const entries = captureLog(() => {
      enableTextShaperGuards(logState, () => 0);
      try {
        const run = acquireShapedRun();
        releaseShapedRun(run);
        releaseShapedRun(run);
      } finally {
        disableTextShaperGuards();
      }
    });
    expect(entries).toHaveLength(1);
    const data = entries[0].data;
    expect(typeof data === 'string' ? data : String(data.message)).toContain('released twice');
  });

  it('stays silent for correctly paired acquire and release calls', () => {
    const entries = captureLog(() => {
      enableTextShaperGuards(logState, () => 0);
      try {
        const run = acquireShapedRun();
        releaseShapedRun(run);
        releaseShapedRun(acquireShapedRun());
      } finally {
        disableTextShaperGuards();
      }
    });
    expect(entries).toEqual([]);
  });
});
