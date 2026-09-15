import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { disableTextSegmentGuards, enableTextSegmentGuards } from './enableTextSegmentGuards';
import { segmentGraphemes } from './textSegment';
import { createDefaultTextSegmenterBackend } from './textSegmenterBackend';

const backend = createDefaultTextSegmenterBackend();

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
    segmentGraphemes(backend, 'text');
    expect(entries).toEqual([]);
  });
});

describe('enableTextSegmentGuards', () => {
  it('warns once and names the provider type when Intl.Segmenter is absent', () => {
    enableTextSegmentGuards();
    vi.stubGlobal('Intl', { Segmenter: undefined });
    segmentGraphemes(backend, 'first');
    segmentGraphemes(backend, 'second');
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as { message?: unknown }).message)).toContain('HostTextSegmenterProvider');
  });

  it('stays silent when the bundled Intl provider is available', () => {
    enableTextSegmentGuards();
    segmentGraphemes(backend, 'text');
    expect(entries).toEqual([]);
  });
});
