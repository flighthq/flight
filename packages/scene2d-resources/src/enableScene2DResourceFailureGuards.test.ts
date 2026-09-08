import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry, Scene2DResourceFailureNotice } from '@flighthq/types/contract';

import {
  areScene2DResourceFailureGuardsEnabled,
  disableScene2DResourceFailureGuards,
  enableScene2DResourceFailureGuards,
} from './enableScene2DResourceFailureGuards';
import { reportScene2DResourceFailure } from './scene2DResourceDiagnostics';

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

function notice(): Scene2DResourceFailureNotice {
  return {
    operation: 'resolveScene2DResources',
    reason: 'required-slots-unresolved',
    total: 2,
    unresolved: 1,
    url: null,
  };
}

afterEach(() => {
  disableScene2DResourceFailureGuards();
});

describe('areScene2DResourceFailureGuardsEnabled', () => {
  it('tracks the global opt-in hook', () => {
    expect(areScene2DResourceFailureGuardsEnabled()).toBe(false);
    enableScene2DResourceFailureGuards();
    expect(areScene2DResourceFailureGuardsEnabled()).toBe(true);
    disableScene2DResourceFailureGuards();
    expect(areScene2DResourceFailureGuardsEnabled()).toBe(false);
  });
});

describe('disableScene2DResourceFailureGuards', () => {
  it('restores silent sentinel handling', () => {
    enableScene2DResourceFailureGuards();
    disableScene2DResourceFailureGuards();
    expect(captureLog(() => reportScene2DResourceFailure(notice()))).toEqual([]);
  });
});

describe('enableScene2DResourceFailureGuards', () => {
  it('warns with aggregate counts while preserving sentinel behavior', () => {
    enableScene2DResourceFailureGuards();
    const entries = captureLog(() => reportScene2DResourceFailure(notice()));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'scene2d-resources' });
    expect(entries[0]?.data).toMatchObject({
      reason: 'required-slots-unresolved',
      total: 2,
      unresolved: 1,
    });
  });
});
