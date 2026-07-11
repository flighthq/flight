import type { TextSegment, TextSegmentRange } from '@flighthq/types';

import { segmentGraphemes, segmentWords } from './textSegment';

// Returns the next grapheme-cluster boundary at or after `index` — the offset a caret lands on when
// stepping right by one user-perceived character, so an emoji or combining sequence is crossed in a
// single step. `index` is clamped into [0, text.length]; at or past the end it returns text.length.
export function getNextGraphemeBoundary(text: string, index: number, locale?: string): number {
  return nextSegmentBoundary(segmentGraphemes(text, locale), index, text.length);
}

// Returns the next word boundary at or after `index` — the offset a caret lands on when jumping right
// by one word (Ctrl/Alt-Right). `index` is clamped into [0, text.length]; at or past the end it
// returns text.length.
export function getNextWordBoundary(text: string, index: number, locale?: string): number {
  return nextSegmentBoundary(segmentWords(text, locale), index, text.length);
}

// Returns the previous grapheme-cluster boundary at or before `index` — the offset a caret lands on
// when stepping left by one user-perceived character. `index` is clamped into [0, text.length]; at or
// before the start it returns 0.
export function getPreviousGraphemeBoundary(text: string, index: number, locale?: string): number {
  return previousSegmentBoundary(segmentGraphemes(text, locale), index);
}

// Returns the previous word boundary at or before `index` — the offset a caret lands on when jumping
// left by one word. `index` is clamped into [0, text.length]; at or before the start it returns 0.
export function getPreviousWordBoundary(text: string, index: number, locale?: string): number {
  return previousSegmentBoundary(segmentWords(text, locale), index);
}

// Returns the word-like segment's range covering `index`, for double-click / word-select. `index` is
// clamped into [0, text.length]; at the very end it resolves against the last character. Returns null
// when the covered segment is not word-like (whitespace or punctuation) or the text is empty — the
// caller should then select nothing, mirroring how a double-click on a space selects no word.
export function getWordRangeAt(text: string, index: number, locale?: string): TextSegmentRange | null {
  if (text.length === 0) return null;
  const clamped = clampIndex(index, text.length);
  // At the trailing boundary there is no segment starting at text.length; resolve against the last
  // character so a double-click at the end still selects the final word.
  const lookup = clamped === text.length ? text.length - 1 : clamped;
  const segments = segmentWords(text, locale);
  for (const segment of segments) {
    if (lookup >= segment.start && lookup < segment.end) {
      return segment.isWordLike === true ? { start: segment.start, end: segment.end } : null;
    }
  }
  return null;
}

// The boundary offsets are every segment start plus text.length (segments cover the string in order
// with strictly increasing starts). Clamping keeps out-of-range indices from throwing per house rules.
function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length) return length;
  return index;
}

function nextSegmentBoundary(segments: readonly TextSegment[], index: number, length: number): number {
  const from = clampIndex(index, length);
  if (from >= length) return length;
  for (const segment of segments) {
    if (segment.start > from) return segment.start;
  }
  return length;
}

function previousSegmentBoundary(segments: readonly TextSegment[], index: number): number {
  const length = segments.length === 0 ? 0 : segments[segments.length - 1].end;
  const from = clampIndex(index, length);
  if (from <= 0) return 0;
  let previous = 0;
  for (const segment of segments) {
    if (segment.start >= from) break;
    previous = segment.start;
  }
  return previous;
}
