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
  for (const segment of hostTextSegmenter.segment(text, TextSegmentGranularity.Grapheme, locale)) {
    out.push(segment);
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
  for (const segment of hostTextSegmenter.segment(text, TextSegmentGranularity.Sentence, locale)) {
    out.push(segment);
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
  for (const segment of hostTextSegmenter.segment(text, TextSegmentGranularity.Word, locale)) {
    out.push(segment);
  }
  return;
}
