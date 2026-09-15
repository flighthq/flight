import type { HostTextSegmenterProvider, TextSegment } from '@flighthq/types/contract';

export function segmentGraphemes(
  textSegmenter: Readonly<HostTextSegmenterProvider>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return textSegmenter.segment(text, 'grapheme', locale);
}

export function segmentSentences(
  textSegmenter: Readonly<HostTextSegmenterProvider>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return textSegmenter.segment(text, 'sentence', locale);
}

export function segmentWords(
  textSegmenter: Readonly<HostTextSegmenterProvider>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return textSegmenter.segment(text, 'word', locale);
}
