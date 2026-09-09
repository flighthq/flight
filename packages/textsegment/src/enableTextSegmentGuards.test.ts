import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { disableTextSegmentGuards, enableTextSegmentGuards } from './enableTextSegmentGuards';
import { segmentGraphemes } from './textSegment';

let entries: LogEntry[];

beforeEach(() => {
  clearLogOnceKeys();
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableTextSegmentGuards();
  setLogSink(null);
  vi.unstubAllGlobals();
});

describe('disableTextSegmentGuards', () => {
  it('restores silent missing-engine recovery', () => {
    enableTextSegmentGuards();
    disableTextSegmentGuards();
    vi.stubGlobal('Intl', { Segmenter: undefined });
    segmentGraphemes('text');
    expect(entries).toEqual([]);
  });
});

describe('enableTextSegmentGuards', () => {
  it('warns once and names the backend fixing call when Intl.Segmenter is absent', () => {
    enableTextSegmentGuards();
    vi.stubGlobal('Intl', { Segmenter: undefined });
    segmentGraphemes('first');
    segmentGraphemes('second');
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as { message?: unknown }).message)).toContain('setTextSegmenterBackend');
  });

  it('stays silent when the bundled Intl provider is available', () => {
    enableTextSegmentGuards();
    segmentGraphemes('text');
    expect(entries).toEqual([]);
  });
});
