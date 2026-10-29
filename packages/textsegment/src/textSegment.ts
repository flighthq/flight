// Generated from crates/flight-textsegment/src/text_segment.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { HostTextSegmenterCapability, TextSegment } from './types.ts';
import { TextSegmentGranularity } from './types.ts';

export function segmentGraphemes(
  out: TextSegment[],
  hostTextSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): void {
  out.length = 0;
  const segments: TextSegment[] = hostTextSegmenter.segment(text, TextSegmentGranularity.Grapheme, locale);
  for (let index = 0, count = segments.length; index < count; index++) {
    out.push(segments[index]);
  }
  return;
}

export function segmentSentences(
  out: TextSegment[],
  hostTextSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): void {
  out.length = 0;
  const segments: TextSegment[] = hostTextSegmenter.segment(text, TextSegmentGranularity.Sentence, locale);
  for (let index = 0, count = segments.length; index < count; index++) {
    out.push(segments[index]);
  }
  return;
}

export function segmentWords(
  out: TextSegment[],
  hostTextSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): void {
  out.length = 0;
  const segments: TextSegment[] = hostTextSegmenter.segment(text, TextSegmentGranularity.Word, locale);
  for (let index = 0, count = segments.length; index < count; index++) {
    out.push(segments[index]);
  }
  return;
}
