import type {
  HostTextSegmenterProvider,
  TextSegment,
  TextSegmentGranularity,
  TextSegmentRange,
} from '@flighthq/types/contract';

import { getTextSegmenterBackend, webTextSegmenterBackend } from './textSegmenterBackend';
import { reportTextSegmenterUnavailable } from './textSegmentGuards';

// Returns the next grapheme-cluster boundary at or after `index` — the offset a caret lands on when
// stepping right by one user-perceived character, so an emoji or combining sequence is crossed in a
// single step. `index` is clamped into [0, text.length]; at or past the end it returns text.length.
export function getNextGraphemeBoundary(
  text: string,
  index: number,
  locale?: string,
  hostTextSegmenter?: Readonly<HostTextSegmenterProvider>,
): number {
  return getNextTextSegmentBoundary(text, index, 'grapheme', locale, hostTextSegmenter);
}

// Returns the next sentence boundary at or after `index`. The bundled Intl path stops its iterator as
// soon as the answer is known and does not materialize the sentence strings or a segment array.
export function getNextSentenceBoundary(
  text: string,
  index: number,
  locale?: string,
  hostTextSegmenter?: Readonly<HostTextSegmenterProvider>,
): number {
  return getNextTextSegmentBoundary(text, index, 'sentence', locale, hostTextSegmenter);
}

// Returns the next word boundary at or after `index` — the offset a caret lands on when jumping right
// by one word (Ctrl/Alt-Right). `index` is clamped into [0, text.length]; at or past the end it
// returns text.length.
export function getNextWordBoundary(
  text: string,
  index: number,
  locale?: string,
  hostTextSegmenter?: Readonly<HostTextSegmenterProvider>,
): number {
  return getNextTextSegmentBoundary(text, index, 'word', locale, hostTextSegmenter);
}

// Returns the previous grapheme-cluster boundary at or before `index` — the offset a caret lands on
// when stepping left by one user-perceived character. `index` is clamped into [0, text.length]; at or
// before the start it returns 0.
export function getPreviousGraphemeBoundary(
  text: string,
  index: number,
  locale?: string,
  hostTextSegmenter?: Readonly<HostTextSegmenterProvider>,
): number {
  return getPreviousTextSegmentBoundary(text, index, 'grapheme', locale, hostTextSegmenter);
}

// Returns the previous sentence boundary at or before `index`. The bundled Intl path walks offsets
// directly and avoids building TextSegment records; custom backends retain their existing array seam.
export function getPreviousSentenceBoundary(
  text: string,
  index: number,
  locale?: string,
  hostTextSegmenter?: Readonly<HostTextSegmenterProvider>,
): number {
  return getPreviousTextSegmentBoundary(text, index, 'sentence', locale, hostTextSegmenter);
}

// Returns the previous word boundary at or before `index` — the offset a caret lands on when jumping
// left by one word. `index` is clamped into [0, text.length]; at or before the start it returns 0.
export function getPreviousWordBoundary(
  text: string,
  index: number,
  locale?: string,
  hostTextSegmenter?: Readonly<HostTextSegmenterProvider>,
): number {
  return getPreviousTextSegmentBoundary(text, index, 'word', locale, hostTextSegmenter);
}

// Returns the word-like segment's range covering `index`, for double-click / word-select. `index` is
// clamped into [0, text.length]; at the very end it resolves against the last character. Returns null
// when the covered segment is not word-like (whitespace or punctuation) or the text is empty — the
// caller should then select nothing, mirroring how a double-click on a space selects no word.
export function getWordRangeAt(
  text: string,
  index: number,
  locale?: string,
  hostTextSegmenter?: Readonly<HostTextSegmenterProvider>,
): TextSegmentRange | null {
  if (text.length === 0) return null;
  const clamped = clampIndex(index, text.length);
  // At the trailing boundary there is no segment starting at text.length; resolve against the last
  // character so a double-click at the end still selects the final word.
  const lookup = clamped === text.length ? text.length - 1 : clamped;
  const backend = getTextSegmenterBackend(hostTextSegmenter);
  if (backend === webTextSegmenterBackend) {
    const segmenter = getBoundarySegmenter(locale, 'word');
    if (segmenter === null) return null;
    for (const segment of segmenter.segment(text)) {
      const end = segment.index + segment.segment.length;
      if (lookup >= segment.index && lookup < end) {
        return segment.isWordLike === true ? { start: segment.index, end } : null;
      }
    }
    return null;
  }
  const segments = backend.segment(text, 'word', locale);
  for (const segment of segments) {
    if (lookup >= segment.start && lookup < segment.end) {
      return segment.isWordLike === true ? { start: segment.start, end: segment.end } : null;
    }
  }
  return null;
}

function getBoundarySegmenter(locale: string | undefined, granularity: TextSegmentGranularity): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') {
    reportTextSegmenterUnavailable();
    return null;
  }
  const key = `${locale ?? ''}|${granularity}`;
  const existing = boundarySegmenterCache.get(key);
  if (existing !== undefined) return existing;
  const segmenter = new Intl.Segmenter(locale, { granularity });
  if (boundarySegmenterCache.size >= BOUNDARY_SEGMENTER_CACHE_CAPACITY) {
    const oldest = boundarySegmenterCache.keys().next().value;
    if (oldest !== undefined) boundarySegmenterCache.delete(oldest);
  }
  boundarySegmenterCache.set(key, segmenter);
  return segmenter;
}

function getNextTextSegmentBoundary(
  text: string,
  index: number,
  granularity: TextSegmentGranularity,
  locale: string | undefined,
  hostTextSegmenter: Readonly<HostTextSegmenterProvider> | undefined,
): number {
  const from = clampIndex(index, text.length);
  if (from >= text.length) return text.length;
  const backend = getTextSegmenterBackend(hostTextSegmenter);
  if (backend !== webTextSegmenterBackend) {
    return nextSegmentBoundary(backend.segment(text, granularity, locale), from, text.length);
  }
  const segmenter = getBoundarySegmenter(locale, granularity);
  if (segmenter === null) return text.length;
  for (const segment of segmenter.segment(text)) {
    if (segment.index > from) return segment.index;
  }
  return text.length;
}

function getPreviousTextSegmentBoundary(
  text: string,
  index: number,
  granularity: TextSegmentGranularity,
  locale: string | undefined,
  hostTextSegmenter: Readonly<HostTextSegmenterProvider> | undefined,
): number {
  const from = clampIndex(index, text.length);
  if (from <= 0) return 0;
  const backend = getTextSegmenterBackend(hostTextSegmenter);
  if (backend !== webTextSegmenterBackend)
    return previousSegmentBoundary(backend.segment(text, granularity, locale), from);
  const segmenter = getBoundarySegmenter(locale, granularity);
  if (segmenter === null) return 0;
  let previous = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.index >= from) break;
    previous = segment.index;
  }
  return previous;
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

const boundarySegmenterCache = new Map<string, Intl.Segmenter>();
const BOUNDARY_SEGMENTER_CACHE_CAPACITY = 64;
