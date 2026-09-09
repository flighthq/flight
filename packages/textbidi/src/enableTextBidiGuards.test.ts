import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { BidiClassBackend, LogEntry } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { disableTextBidiGuards, enableTextBidiGuards } from './enableTextBidiGuards';
import { resolveBidiLevels } from './resolveBidiLevels';

let entries: LogEntry[];

beforeEach(() => {
  clearLogOnceKeys();
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableTextBidiGuards();
  setLogSink(null);
});

describe('disableTextBidiGuards', () => {
  it('restores silent compact fallback', () => {
    enableTextBidiGuards();
    disableTextBidiGuards();
    resolveBidiLevels('中', 'ltr');
    expect(entries).toEqual([]);
  });
});

describe('enableTextBidiGuards', () => {
  it('warns once and names the backend fixing call for uncovered code points', () => {
    enableTextBidiGuards();
    resolveBidiLevels('中文', 'ltr');
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as { message?: unknown }).message)).toContain('setBidiClassBackend');
  });

  it('stays silent for compact-table coverage', () => {
    enableTextBidiGuards();
    resolveBidiLevels('abc שלום ابت', 'auto');
    expect(entries).toEqual([]);
  });

  it('stays silent for an explicit non-compact backend', () => {
    enableTextBidiGuards();
    const custom: BidiClassBackend = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'L' };
    resolveBidiLevels('中', 'ltr', custom);
    expect(entries).toEqual([]);
  });
});
