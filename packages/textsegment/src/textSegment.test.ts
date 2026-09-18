import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostTextSegmenterCapability, TextSegment, TextSegmentGranularity } from '@flighthq/types/contract';

import { segmentGraphemes, segmentSentences, segmentWords } from './textSegment';
import { createDefaultTextSegmenterBackend } from './textSegmenterBackend';

const backend = createDefaultTextSegmenterBackend();

describe('segmentGraphemes', () => {
  it('isolates callers that interleave different explicit hosts', () => {
    const first = taggingBackend('first');
    const second = taggingBackend('second');
    expect(segmentGraphemes(first, 'hi')[0].text).toBe('first');
    expect(segmentGraphemes(second, 'hi')[0].text).toBe('second');
    expect(segmentGraphemes(first, 'hi')[0].text).toBe('first');
  });

  it('treats a ZWJ family emoji as one grapheme', () => {
    const segments = segmentGraphemes(backend, 'a👨‍👩‍👧b');
    expect(segments.map((s) => s.text)).toEqual(['a', '👨‍👩‍👧', 'b']);
    expect(segments[1].start).toBe(1);
    expect(segments[1].end).toBe('a👨‍👩‍👧'.length);
  });

  it('treats a base plus combining mark as one grapheme', () => {
    const segments = segmentGraphemes(backend, 'éx');
    expect(segments.map((s) => s.text)).toEqual(['é', 'x']);
  });

  it('threads the locale argument to the active backend', () => {
    let seenLocale: string | undefined = 'unset';
    const fake = {} as HostTextSegmenterCapability;
    fake.segment = (text: string, _granularity: TextSegmentGranularity, locale?: string): readonly TextSegment[] => {
      seenLocale = locale;
      return [{ start: 0, end: text.length, text }];
    };
    segmentGraphemes(fake, 'hi', 'de-DE');
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
    const segments = segmentSentences(backend, 'Hi. Bye.');
    expect(segments.map((s) => s.text.trim())).toEqual(['Hi.', 'Bye.']);
  });
});

describe('segmentWords', () => {
  it('marks words as word-like and punctuation/whitespace as not', () => {
    const segments = segmentWords(backend, 'Hello, world.');
    const words = segments.filter((s) => s.isWordLike === true).map((s) => s.text);
    expect(words).toEqual(['Hello', 'world']);
    const comma = segments.find((s) => s.text === ',');
    expect(comma?.isWordLike).toBe(false);
    const space = segments.find((s) => s.text === ' ');
    expect(space?.isWordLike).toBe(false);
  });
});
