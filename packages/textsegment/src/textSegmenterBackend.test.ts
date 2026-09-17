import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/types/contract';
import type { HostTextSegmenterCapability, TextSegment, TextSegmentGranularity } from '@flighthq/types/contract';
import { vi } from 'vitest';

import {
  createDefaultTextSegmenterBackend,
  createWebTextSegmenterBackend,
  explainTextSegmenterBackend,
  initializeWebTextSegmenterBackend,
  webTextSegmenterBackend,
} from './textSegmenterBackend';

interface RecordingBackend extends HostTextSegmenterCapability {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createDefaultTextSegmenterBackend', () => {
  it('returns a web segmenter backend', () => {
    const backend = createDefaultTextSegmenterBackend();
    expect(backend.segment('ab', 'grapheme').length).toBe(2);
  });
});

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

describe('explainTextSegmenterBackend', () => {
  it('reports the bundled Intl capability as available', () => {
    expect(explainTextSegmenterBackend(webTextSegmenterBackend)).toEqual({
      available: true,
      backend: 'web-intl',
      intlSegmenterAvailable: true,
    });
  });

  it('identifies a custom capability independently of Intl availability', () => {
    expect(explainTextSegmenterBackend(recordingBackend())).toEqual({
      available: true,
      backend: 'custom',
      intlSegmenterAvailable: true,
    });
  });

  it('reports the bundled capability unavailable when the runtime primitive is absent', () => {
    vi.stubGlobal('Intl', { Segmenter: undefined });
    expect(explainTextSegmenterBackend(webTextSegmenterBackend)).toEqual({
      available: false,
      backend: 'web-intl',
      intlSegmenterAvailable: false,
    });
  });
});

describe('initializeWebTextSegmenterBackend', () => {
  it('is the construction initializer of createWebTextSegmenterBackend', () => {
    expect(typeof initializeWebTextSegmenterBackend).toBe('function');
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
