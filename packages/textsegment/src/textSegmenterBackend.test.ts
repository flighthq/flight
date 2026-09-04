import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HasTextSegmenter,
  TextSegment,
  TextSegmentGranularity,
  TextSegmenterBackend,
} from '@flighthq/types/contract';

import {
  createWebTextSegmenterBackend,
  getTextSegmenterBackend,
  initializeWebTextSegmenterBackend,
  setTextSegmenterBackend,
  webTextSegmenterBackend,
} from './textSegmenterBackend';

interface RecordingBackend extends TextSegmenterBackend {
  calls: Array<{ text: string; granularity: TextSegmentGranularity; locale: string | undefined }>;
}

function recordingBackend(): RecordingBackend {
  const calls: RecordingBackend['calls'] = [];
  const out = allocateEntity<any>();
  out.calls = calls;
  out.segment = (text: string, granularity: TextSegmentGranularity, locale?: string): readonly TextSegment[] => {
    calls.push({ text, granularity, locale });
    return [{ start: 0, end: text.length, text }];
  };
  return finishEntity(out);
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
  it('returns an explicit host provider ahead of the legacy backend', () => {
    const legacy = recordingBackend();
    const explicit = recordingBackend();
    const host: HasTextSegmenter = { text: { segmenter: explicit } };
    setTextSegmenterBackend(legacy);
    expect(getTextSegmenterBackend(host)).toBe(explicit);
  });

  it('falls back to the stable bundled web backend when none is registered', () => {
    const backend = getTextSegmenterBackend();
    expect(backend).toBe(webTextSegmenterBackend);
    expect(backend.segment('ab', 'grapheme').length).toBe(2);
  });

  it('returns the registered backend', () => {
    const backend = recordingBackend();
    setTextSegmenterBackend(backend);
    expect(getTextSegmenterBackend()).toBe(backend);
  });
});

describe('initializeWebTextSegmenterBackend', () => {
  it('is the construction initializer of createWebTextSegmenterBackend', () => {
    expect(typeof initializeWebTextSegmenterBackend).toBe('function');
  });
});

describe('setTextSegmenterBackend', () => {
  it('routes segmentation through the installed backend', () => {
    const backend = recordingBackend();
    setTextSegmenterBackend(backend);
    getTextSegmenterBackend().segment('hello', 'sentence', 'fr');
    expect(backend.calls).toEqual([{ text: 'hello', granularity: 'sentence', locale: 'fr' }]);
  });

  it('clears back to the stable bundled web default when passed null', () => {
    setTextSegmenterBackend(recordingBackend());
    setTextSegmenterBackend(null);
    // The web default segments a ZWJ cluster as one grapheme; a recording backend would not.
    expect(getTextSegmenterBackend().segment('a👨‍👩‍👧b', 'grapheme').length).toBe(3);
  });
});
describe('webTextSegmenterBackend', () => {
  it('provides the stable bundled Intl fallback', () => {
    expect(webTextSegmenterBackend.segment('a👨‍👩‍👧b', 'grapheme').map((segment) => segment.text)).toEqual([
      'a',
      '👨‍👩‍👧',
      'b',
    ]);
  });
});
