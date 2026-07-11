import type { TextSegment } from '@flighthq/types';

import { getTextSegmenterBackend } from './textSegmenterBackend';

// Enumerates the grapheme clusters of `text` (UAX #29) via the active backend. Each segment is one
// user-perceived character: an emoji ZWJ sequence or a base-plus-combining-mark cluster is a single
// segment, not its constituent code points. `locale` is threaded to the backend for the rare
// locale-tailored cases. isWordLike is absent on grapheme segments.
export function segmentGraphemes(text: string, locale?: string): readonly TextSegment[] {
  return getTextSegmenterBackend().segment(text, 'grapheme', locale);
}

// Enumerates the sentences of `text` (UAX #29) via the active backend, in order and covering the
// whole string. isWordLike is absent on sentence segments.
export function segmentSentences(text: string, locale?: string): readonly TextSegment[] {
  return getTextSegmenterBackend().segment(text, 'sentence', locale);
}

// Enumerates the words of `text` (UAX #29) via the active backend. Word segments carry isWordLike:
// true for letters/numbers (a real word), false for the punctuation and whitespace runs between
// them. Filter on isWordLike to keep only words. `locale` is threaded to the backend.
export function segmentWords(text: string, locale?: string): readonly TextSegment[] {
  return getTextSegmenterBackend().segment(text, 'word', locale);
}
