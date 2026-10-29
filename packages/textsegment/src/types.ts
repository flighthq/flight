// Unicode text-segmentation seam (UAX #29). Operations accept an explicit
// HostTextSegmenterCapability. A from-scratch UAX #29 provider can be composed by headless/native
// hosts or a flight-rs table kernel. Line breaking (UAX #14) is a separate algorithm owned by
// @flighthq/textlayout.

export type TextSegmentGranularity = 'grapheme' | 'word' | 'sentence';

export interface TextSegment {
  start: number;
  end: number;
  text: string;
  isWordLike?: boolean;
}

export interface TextSegmentRange {
  start: number;
  end: number;
}

export interface HostTextSegmentCapabilities {
  readonly segmenter?: HostTextSegmenterCapability;
}

export interface HostTextSegmenterCapability {
  segment(text: string, granularity: TextSegmentGranularity, locale?: string): TextSegment[];
}

export type TextSegmenterKind = 'custom' | 'web-intl';

export interface TextSegmenterExplanation {
  available: boolean;
  backend: TextSegmenterKind;
  intlSegmenterAvailable: boolean;
}

export type TextSegmentGuard = () => void;

export const TextSegmentGranularity = {
  Grapheme: 'grapheme',
  Word: 'word',
  Sentence: 'sentence',
} as const;

export const TextSegmenterKind = {
  Custom: 'custom',
  WebIntl: 'web-intl',
} as const;

export function getTextSegmenterKindString(value: TextSegmenterKind): string {
  return value;
}

export function getTextSegmentGranularityString(value: TextSegmentGranularity): string {
  return value;
}

export function parseTextSegmenterKind(value: string): TextSegmenterKind | undefined {
  if (value === 'custom' || value === 'web-intl') return value;
  return undefined;
}

export function parseTextSegmentGranularity(value: string): TextSegmentGranularity | undefined {
  if (value === 'grapheme' || value === 'word' || value === 'sentence') return value;
  return undefined;
}
