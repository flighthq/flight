import type { HostTextSegmenterCapability, TextSegment } from '@flighthq/types/contract';

export function segmentGraphemes(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return textSegmenter.segment(text, 'grapheme', locale);
}

export function segmentSentences(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return textSegmenter.segment(text, 'sentence', locale);
}

export function segmentWords(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return textSegmenter.segment(text, 'word', locale);
}
