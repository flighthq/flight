import type { TextSegment, TextSegmentGranularity, TextSegmenterBackend } from '@flighthq/types';

import {
  createWebTextSegmenterBackend,
  getTextSegmenterBackend,
  setTextSegmenterBackend,
} from './textSegmenterBackend';

interface RecordingBackend extends TextSegmenterBackend {
  calls: Array<{ text: string; granularity: TextSegmentGranularity; locale: string | undefined }>;
}

function recordingBackend(): RecordingBackend {
  const calls: RecordingBackend['calls'] = [];
  return {
    calls,
    segment(text: string, granularity: TextSegmentGranularity, locale?: string): readonly TextSegment[] {
      calls.push({ text, granularity, locale });
      return [{ start: 0, end: text.length, text }];
    },
  };
}

afterEach(() => setTextSegmenterBackend(null));

describe('createWebTextSegmenterBackend', () => {
  it('segments a ZWJ family emoji as a single grapheme', () => {
    const segments = createWebTextSegmenterBackend().segment('a👨‍👩‍👧b', 'grapheme');
    expect(segments.map((s) => s.text)).toEqual(['a', '👨‍👩‍👧', 'b']);
  });

  it('reports isWordLike for word granularity and omits it otherwise', () => {
    const backend = createWebTextSegmenterBackend();
    const words = backend.segment('Hi there', 'word');
    expect(words.every((s) => typeof s.isWordLike === 'boolean')).toBe(true);
    const graphemes = backend.segment('Hi', 'grapheme');
    expect(graphemes.every((s) => s.isWordLike === undefined)).toBe(true);
  });

  it('produces gap-free start/end offsets covering the whole string', () => {
    const segments = createWebTextSegmenterBackend().segment('abc', 'grapheme');
    expect(segments).toEqual([
      { start: 0, end: 1, text: 'a' },
      { start: 1, end: 2, text: 'b' },
      { start: 2, end: 3, text: 'c' },
    ]);
  });
});

describe('getTextSegmenterBackend', () => {
  it('lazily falls back to a web backend when none is registered', () => {
    const backend = getTextSegmenterBackend();
    expect(backend).not.toBeNull();
    expect(backend.segment('ab', 'grapheme').length).toBe(2);
  });

  it('returns the registered backend', () => {
    const backend = recordingBackend();
    setTextSegmenterBackend(backend);
    expect(getTextSegmenterBackend()).toBe(backend);
  });
});

describe('setTextSegmenterBackend', () => {
  it('routes segmentation through the installed backend', () => {
    const backend = recordingBackend();
    setTextSegmenterBackend(backend);
    getTextSegmenterBackend().segment('hello', 'sentence', 'fr');
    expect(backend.calls).toEqual([{ text: 'hello', granularity: 'sentence', locale: 'fr' }]);
  });

  it('clears back to the lazy web default when passed null', () => {
    setTextSegmenterBackend(recordingBackend());
    setTextSegmenterBackend(null);
    // The web default segments a ZWJ cluster as one grapheme; a recording backend would not.
    expect(getTextSegmenterBackend().segment('a👨‍👩‍👧b', 'grapheme').length).toBe(3);
  });
});
