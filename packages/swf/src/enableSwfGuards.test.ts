import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { areSwfGuardsEnabled, disableSwfGuards, enableSwfGuards } from './enableSwfGuards';
import { readSwfFilterList } from './swfFilter';
import { SwfReader } from './swfReader';

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

function readUnknownFilter(): boolean {
  const bytes = new Uint8Array([1, 0xfe, 13]);
  return readSwfFilterList(new SwfReader(bytes, 0, bytes.length), [], []);
}

afterEach(() => {
  disableSwfGuards();
});

describe('areSwfGuardsEnabled', () => {
  it('reports whether unknown-filter diagnostics are installed', () => {
    expect(areSwfGuardsEnabled()).toBe(false);
    enableSwfGuards();
    expect(areSwfGuardsEnabled()).toBe(true);
    disableSwfGuards();
    expect(areSwfGuardsEnabled()).toBe(false);
  });
});

describe('disableSwfGuards', () => {
  it('restores silence without changing the safe incomplete-list result', () => {
    enableSwfGuards();
    disableSwfGuards();
    const entries = captureLog(() => expect(readUnknownFilter()).toBe(false));

    expect(entries).toHaveLength(0);
  });
});

describe('enableSwfGuards', () => {
  it('WARNS once with the unknown filter identity and the trailing-field consequence', () => {
    enableSwfGuards();
    const entries = captureLog(() => {
      expect(readUnknownFilter()).toBe(false);
      expect(readUnknownFilter()).toBe(false);
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].channel).toBe('swf');
    expect(entries[0].data).toMatchObject({ filterId: 0xfe, filterIndex: 0 });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('trailing blend mode');
  });
});
