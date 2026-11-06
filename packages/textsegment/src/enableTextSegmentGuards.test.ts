import type { LogState } from '@flighthq/log/contract';
import { createLogState, setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { disableTextSegmentGuards, enableTextSegmentGuards } from './enableTextSegmentGuards.ts';
import { segmentGraphemes } from './textSegment.ts';
import { webTextSegmenterBackend } from './textSegmenterBackend.ts';

const backend = webTextSegmenterBackend;

let entries: LogEntry[];
let logState: LogState;

beforeEach(() => {
  entries = [];
  logState = createLogState();
  setLogSink(logState, (entry) => entries.push(entry));
});

afterEach(() => {
  disableTextSegmentGuards();
  setLogSink(logState, null);
  vi.unstubAllGlobals();
});

describe('disableTextSegmentGuards', () => {
  it('restores silent missing-engine recovery', () => {
    enableTextSegmentGuards(logState, () => 0);
    disableTextSegmentGuards();
    vi.stubGlobal('Intl', { Segmenter: undefined });
    segmentGraphemes([], backend, 'text');
    expect(entries).toEqual([]);
  });
});

describe('enableTextSegmentGuards', () => {
  it('warns once and names the provider type when Intl.Segmenter is absent', () => {
    enableTextSegmentGuards(logState, () => 0);
    vi.stubGlobal('Intl', { Segmenter: undefined });
    segmentGraphemes([], backend, 'first');
    segmentGraphemes([], backend, 'second');
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as { message?: unknown }).message)).toContain('HostTextSegmenterCapability');
  });

  it('stays silent when the bundled Intl provider is available', () => {
    enableTextSegmentGuards(logState, () => 0);
    segmentGraphemes([], backend, 'text');
    expect(entries).toEqual([]);
  });
});
