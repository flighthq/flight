import type {
  HostTextSegmenterCapability,
  TextSegment,
  TextSegmentGranularity,
  TextSegmentRange,
} from '@flighthq/types/contract';

import { webTextSegmenterBackend } from './textSegmenterBackend.ts';
import { reportTextSegmenterUnavailable } from './textSegmentGuards.ts';

export function getNextGraphemeBoundary(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  locale?: string,
): number {
  return getNextTextSegmentBoundary(textSegmenter, text, index, 'grapheme', locale);
}

export function getNextSentenceBoundary(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  locale?: string,
): number {
  return getNextTextSegmentBoundary(textSegmenter, text, index, 'sentence', locale);
}

export function getNextWordBoundary(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  locale?: string,
): number {
  return getNextTextSegmentBoundary(textSegmenter, text, index, 'word', locale);
}

export function getPreviousGraphemeBoundary(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  locale?: string,
): number {
  return getPreviousTextSegmentBoundary(textSegmenter, text, index, 'grapheme', locale);
}

export function getPreviousSentenceBoundary(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  locale?: string,
): number {
  return getPreviousTextSegmentBoundary(textSegmenter, text, index, 'sentence', locale);
}

export function getPreviousWordBoundary(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  locale?: string,
): number {
  return getPreviousTextSegmentBoundary(textSegmenter, text, index, 'word', locale);
}

export function getWordRangeAt(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  locale?: string,
): TextSegmentRange | null {
  if (text.length === 0) return null;
  const clamped = clampIndex(index, text.length);
  // At the trailing boundary there is no segment starting at text.length; resolve against the last
  // character so a double-click at the end still selects the final word.
  const lookup = clamped === text.length ? text.length - 1 : clamped;
  if (textSegmenter === webTextSegmenterBackend) {
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
  const segments = textSegmenter.segment(text, 'word', locale);
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
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  granularity: TextSegmentGranularity,
  locale: string | undefined,
): number {
  const from = clampIndex(index, text.length);
  if (from >= text.length) return text.length;
  if (textSegmenter !== webTextSegmenterBackend) {
    return nextSegmentBoundary(textSegmenter.segment(text, granularity, locale), from, text.length);
  }
  const segmenter = getBoundarySegmenter(locale, granularity);
  if (segmenter === null) return text.length;
  for (const segment of segmenter.segment(text)) {
    if (segment.index > from) return segment.index;
  }
  return text.length;
}

function getPreviousTextSegmentBoundary(
  textSegmenter: Readonly<HostTextSegmenterCapability>,
  text: string,
  index: number,
  granularity: TextSegmentGranularity,
  locale: string | undefined,
): number {
  const from = clampIndex(index, text.length);
  if (from <= 0) return 0;
  if (textSegmenter !== webTextSegmenterBackend)
    return previousSegmentBoundary(textSegmenter.segment(text, granularity, locale), from);
  const segmenter = getBoundarySegmenter(locale, granularity);
  if (segmenter === null) return 0;
  let previous = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.index >= from) break;
    previous = segment.index;
  }
  return previous;
}

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
