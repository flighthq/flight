import type { LogState } from '@flighthq/log/contract';
import { addLogSink, createLogState, createMemoryLogSink, getMemoryLogSinkEntries } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { areSwfGuardsEnabled, disableSwfGuards, enableSwfGuards } from './enableSwfGuards.ts';
import { readSwfFilterList } from './swfFilter.ts';
import { SwfReader } from './swfReader.ts';

function captureLog(logState: LogState, run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(logState, sink.sink);
  run();
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

function readUnknownFilter(): boolean {
  const bytes = new Uint8Array([1, 0xfe, 13]);
  return readSwfFilterList(new SwfReader(bytes, 0, bytes.length), [], []);
}

beforeEach(() => {
  disableSwfGuards();
});

afterEach(() => {
  disableSwfGuards();
});

describe('areSwfGuardsEnabled', () => {
  it('reports whether unknown-filter diagnostics are installed', () => {
    expect(areSwfGuardsEnabled()).toBe(false);
    enableSwfGuards(createLogState(), () => 0);
    expect(areSwfGuardsEnabled()).toBe(true);
    disableSwfGuards();
    expect(areSwfGuardsEnabled()).toBe(false);
  });
});

describe('disableSwfGuards', () => {
  it('restores silence without changing the safe incomplete-list result', () => {
    const logState = createLogState();
    enableSwfGuards(logState, () => 0);
    disableSwfGuards();
    const entries = captureLog(logState, () => expect(readUnknownFilter()).toBe(false));

    expect(entries).toHaveLength(0);
  });
});

describe('enableSwfGuards', () => {
  it('WARNS once with the unknown filter identity and the trailing-field consequence', () => {
    const logState = createLogState();
    enableSwfGuards(logState, () => 0);
    const entries = captureLog(logState, () => {
      expect(readUnknownFilter()).toBe(false);
      expect(readUnknownFilter()).toBe(false);
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].channel).toBe('swf');
    expect(entries[0].data).toMatchObject({ filterId: 0xfe, filterIndex: 0 });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('trailing blend mode');
  });
});
