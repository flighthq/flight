import type { Host } from '@flighthq/types/contract';

import { segmentGraphemes, segmentSentences, segmentWords } from './textSegment.ts';
import { webTextSegmenterBackend } from './textSegmenterBackend.ts';
import type { HostTextSegmenterCapability, TextSegment, TextSegmentGranularity } from './types.ts';

const backend = webTextSegmenterBackend;

describe('segmentGraphemes', () => {
  it('accepts the text segmenter capability exposed by Host', () => {
    const readonlySegments: readonly TextSegment[] = [{ start: 0, end: 5, text: 'hello' }];
    const hostTextSegment: Host['textSegment'] = {
      segmenter: { segment: () => readonlySegments },
    };
    const hostCapability = hostTextSegment.segmenter;
    if (hostCapability === undefined) throw new Error('fixture must provide Host.textSegment.segmenter');
    const segments: TextSegment[] = [];

    segmentGraphemes(segments, hostCapability, 'hello');

    expect(segments).toEqual(readonlySegments);
  });

  it('isolates callers that interleave different explicit hosts', () => {
    const first = taggingBackend('first');
    const second = taggingBackend('second');
    const segments: TextSegment[] = [];
    segmentGraphemes(segments, first, 'hi');
    expect(segments[0].text).toBe('first');
    segmentGraphemes(segments, second, 'hi');
    expect(segments[0].text).toBe('second');
    segmentGraphemes(segments, first, 'hi');
    expect(segments[0].text).toBe('first');
  });

  it('treats a ZWJ family emoji as one grapheme', () => {
    const segments: TextSegment[] = [];
    segmentGraphemes(segments, backend, 'a👨‍👩‍👧b');
    expect(segments.map((s) => s.text)).toEqual(['a', '👨‍👩‍👧', 'b']);
    expect(segments[1].start).toBe(1);
    expect(segments[1].end).toBe('a👨‍👩‍👧'.length);
  });

  it('treats a base plus combining mark as one grapheme', () => {
    const segments: TextSegment[] = [];
    segmentGraphemes(segments, backend, 'éx');
    expect(segments.map((s) => s.text)).toEqual(['é', 'x']);
  });

  it('threads the locale argument to the active backend', () => {
    let seenLocale: string | undefined = 'unset';
    const fake = {} as HostTextSegmenterCapability;
    fake.segment = (text: string, _granularity: TextSegmentGranularity, locale?: string): TextSegment[] => {
      seenLocale = locale;
      return [{ start: 0, end: text.length, text }];
    };
    segmentGraphemes([], fake, 'hi', 'de-DE');
    expect(seenLocale).toBe('de-DE');
  });
});

function taggingBackend(tag: string): HostTextSegmenterCapability {
  const out = {} as HostTextSegmenterCapability;
  out.segment = () => [{ start: 0, end: tag.length, text: tag }];
  return out;
}

describe('segmentSentences', () => {
  it('splits into sentences', () => {
    const segments: TextSegment[] = [];
    segmentSentences(segments, backend, 'Hi. Bye.');
    expect(segments.map((s) => s.text.trim())).toEqual(['Hi.', 'Bye.']);
  });
});

describe('segmentWords', () => {
  it('marks words as word-like and punctuation/whitespace as not', () => {
    const segments: TextSegment[] = [];
    segmentWords(segments, backend, 'Hello, world.');
    const words = segments.filter((s) => s.isWordLike === true).map((s) => s.text);
    expect(words).toEqual(['Hello', 'world']);
    const comma = segments.find((s) => s.text === ',');
    expect(comma?.isWordLike).toBe(false);
    const space = segments.find((s) => s.text === ' ');
    expect(space?.isWordLike).toBe(false);
  });
});
