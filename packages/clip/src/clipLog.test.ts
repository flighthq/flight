import { createLogState, createMemoryLogSink, getMemoryLogSinkEntries, setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { logClipWarning } from './clipLog.ts';

describe('logClipWarning', () => {
  it('forwards the exact structured warning envelope', () => {
    const logs = createLogState();
    const sink = createMemoryLogSink(4);
    setLogSink(logs, sink.sink);
    logClipWarning(logs, 7, 'clip:test', 'message');

    const entries: LogEntry[] = [];
    getMemoryLogSinkEntries(entries, sink);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'clip', data: { message: 'message' }, timestampMs: 7 });
  });
});
