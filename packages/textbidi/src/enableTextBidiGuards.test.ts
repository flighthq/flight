import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { BidiClassKernel, LogEntry } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { compactBidiClassKernel } from './bidiClassKernel.ts';
import { disableTextBidiGuards, enableTextBidiGuards } from './enableTextBidiGuards.ts';
import { resolveBidiLevels } from './resolveBidiLevels.ts';

const kernel = compactBidiClassKernel;

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
    resolveBidiLevels(kernel, '中', 'ltr');
    expect(entries).toEqual([]);
  });
});

describe('enableTextBidiGuards', () => {
  it('warns once and names the kernel fixing call for uncovered code points', () => {
    enableTextBidiGuards();
    resolveBidiLevels(kernel, '中文', 'ltr');
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as { message?: unknown }).message)).toContain('BidiClassKernel');
  });

  it('stays silent for compact-table coverage', () => {
    enableTextBidiGuards();
    resolveBidiLevels(kernel, 'abc שלום ابت', 'auto');
    expect(entries).toEqual([]);
  });

  it('stays silent for an explicit non-compact kernel', () => {
    enableTextBidiGuards();
    const custom: BidiClassKernel = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'L' };
    resolveBidiLevels(custom, '中', 'ltr');
    expect(entries).toEqual([]);
  });
});
