// Unicode text-segmentation seam (UAX #29). Free functions in @flighthq/textsegment delegate to the
// active TextSegmenterBackend — the default web backend wraps the browser-native Intl.Segmenter, so
// the common path ships no Unicode tables; a from-scratch UAX #29 backend (headless/native hosts, or
// a flight-rs table kernel) replaces it via setTextSegmenterBackend. Line breaking (UAX #14) is NOT
// here: it is a different algorithm Intl.Segmenter does not provide and @flighthq/textlayout owns it.

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

// The seam: a host backend whose single method segments `text` at `granularity`, given an optional
// BCP-47 `locale`. One method keeps a from-scratch backend to a single function to implement, and
// mirrors Intl.Segmenter, which is itself parameterized by granularity. Returns segments in order,
// covering the whole string with no gaps.
export interface TextSegmenterBackend {
  segment(text: string, granularity: TextSegmentGranularity, locale?: string): readonly TextSegment[];
}
