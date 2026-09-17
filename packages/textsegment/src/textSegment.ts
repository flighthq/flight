import type { HostTextSegmenterCapability, TextSegment } from '@flighthq/types/contract';

export function segmentGraphemes(
  hostTextSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return hostTextSegmenter.segment(text, 'grapheme', locale);
}

export function segmentSentences(
  hostTextSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return hostTextSegmenter.segment(text, 'sentence', locale);
}

export function segmentWords(
  hostTextSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  locale?: string,
): readonly TextSegment[] {
  return hostTextSegmenter.segment(text, 'word', locale);
}
