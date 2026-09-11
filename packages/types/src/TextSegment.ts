import type { Entity } from './Entity';
// Unicode text-segmentation seam (UAX #29). Free functions in @flighthq/textsegment accept an
// explicit HostTextSegmenterProvider; when omitted, the bundled Intl.Segmenter provider remains the
// compatibility fallback. A from-scratch UAX #29 provider can be composed by headless/native
// hosts or a flight-rs table kernel. Line breaking (UAX #14) is NOT here: it is a different
// algorithm Intl.Segmenter does not provide and @flighthq/textlayout owns it.

// The three UAX #29 boundary families the seam segments a string into. A caret steps by 'grapheme'
// (an emoji or combining sequence is one unit), word-select extends by 'word', and sentence
// navigation by 'sentence'.
export type TextSegmentGranularity = 'grapheme' | 'word' | 'sentence';

// One segment of a string: the half-open [start, end) range in UTF-16 code units and its text. For
// 'word' granularity, isWordLike distinguishes word segments (letters/numbers) from punctuation and
// whitespace; it is absent for 'grapheme' and 'sentence' (Intl.Segmenter reports it for words only).
export interface TextSegment {
  start: number;
  end: number;
  text: string;
  isWordLike?: boolean;
}

// A half-open [start, end) range in UTF-16 code units — the result of a boundary/word query that has
// no text payload (e.g. getWordRangeAt). start === end denotes an empty range.
export interface TextSegmentRange {
  start: number;
  end: number;
}

// The seam: a host provider whose single method segments `text` at `granularity`, given an optional
// BCP-47 `locale`. One method keeps a from-scratch provider to a single function to implement, and
// mirrors Intl.Segmenter, which is itself parameterized by granularity. Returns segments in order,
// covering the whole string with no gaps.
export interface HostTextSegmenterProvider extends Entity {
  segment(text: string, granularity: TextSegmentGranularity, locale?: string): readonly TextSegment[];
}

export type TextSegmenterBackendKind = 'custom' | 'web-intl';

// Pull-style description of the selected provider and whether its runtime primitive can answer now.
export interface TextSegmenterBackendExplanation {
  available: boolean;
  backend: TextSegmenterBackendKind;
  intlSegmenterAvailable: boolean;
}

// Optional missing-Intl seam installed by enableTextSegmentGuards. Null is the production default.
export type TextSegmentGuard = () => void;
