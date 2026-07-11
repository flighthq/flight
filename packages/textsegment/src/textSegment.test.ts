import type { TextSegment, TextSegmentGranularity, TextSegmenterBackend } from '@flighthq/types';

import { segmentGraphemes, segmentSentences, segmentWords } from './textSegment';
import { setTextSegmenterBackend } from './textSegmenterBackend';

afterEach(() => setTextSegmenterBackend(null));

describe('segmentGraphemes', () => {
  it('treats a ZWJ family emoji as one grapheme', () => {
    const segments = segmentGraphemes('a👨‍👩‍👧b');
    expect(segments.map((s) => s.text)).toEqual(['a', '👨‍👩‍👧', 'b']);
    expect(segments[1].start).toBe(1);
    expect(segments[1].end).toBe('a👨‍👩‍👧'.length);
  });

  it('treats a base plus combining mark as one grapheme', () => {
    // 'e' + combining acute accent (U+0301) is one user-perceived character.
    const segments = segmentGraphemes('éx');
    expect(segments.map((s) => s.text)).toEqual(['é', 'x']);
  });

  it('threads the locale argument to the active backend', () => {
    let seenLocale: string | undefined = 'unset';
    const fake: TextSegmenterBackend = {
      segment(text: string, _granularity: TextSegmentGranularity, locale?: string): readonly TextSegment[] {
        seenLocale = locale;
        return [{ start: 0, end: text.length, text }];
      },
    };
    setTextSegmenterBackend(fake);
    segmentGraphemes('hi', 'de-DE');
    expect(seenLocale).toBe('de-DE');
  });
});

describe('segmentSentences', () => {
  it('splits into sentences', () => {
    const segments = segmentSentences('Hi. Bye.');
    expect(segments.map((s) => s.text.trim())).toEqual(['Hi.', 'Bye.']);
  });
});

describe('segmentWords', () => {
  it('marks words as word-like and punctuation/whitespace as not', () => {
    const segments = segmentWords('Hello, world.');
    const words = segments.filter((s) => s.isWordLike === true).map((s) => s.text);
    expect(words).toEqual(['Hello', 'world']);
    const comma = segments.find((s) => s.text === ',');
    expect(comma?.isWordLike).toBe(false);
    const space = segments.find((s) => s.text === ' ');
    expect(space?.isWordLike).toBe(false);
  });
});
