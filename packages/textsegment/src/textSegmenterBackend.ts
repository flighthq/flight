import type { TextSegment, TextSegmentGranularity, TextSegmenterBackend } from '@flighthq/types';

// Builds the default web backend: a wrapper over the browser-native Intl.Segmenter. It ships no
// Unicode tables — the engine already carries them — so the common path costs nothing in bundle
// weight. Intl.Segmenter instances are cached by (locale, granularity) because constructing one is
// expensive relative to a single segment() call. Where Intl.Segmenter is absent (an old or headless
// engine), segment() returns [] rather than throwing; install a from-scratch UAX #29 backend via
// setTextSegmenterBackend for those hosts.
export function createWebTextSegmenterBackend(): TextSegmenterBackend {
  return { segment: segmentWithIntlSegmenter };
}

// Returns the active segmenter backend, lazily creating the web default the first time so there is
// always an answer. A native host or a from-scratch UAX #29 backend replaces it via
// setTextSegmenterBackend; passing null there restores this lazy web default.
export function getTextSegmenterBackend(): TextSegmenterBackend {
  if (_backend === null) _backend = createWebTextSegmenterBackend();
  return _backend;
}

// Installs a segmenter backend; pass null to fall back to the lazily-created web default. Last write
// wins — registering over an existing backend replaces it. Opt-in and side-effect-free at import:
// nothing installs until a host calls this (or a segment*/boundary query lazily builds the web one).
export function setTextSegmenterBackend(backend: TextSegmenterBackend | null): void {
  _backend = backend;
}

let _backend: TextSegmenterBackend | null = null;

// Cached Intl.Segmenter instances keyed by `locale|granularity`. A Map preserves insertion order, so
// the first key is the oldest and drives simple FIFO eviction once the cache is full. Instances are
// immutable, so sharing them across calls is safe.
const _segmenterCache = new Map<string, Intl.Segmenter>();
const _segmenterCacheCapacity = 64;

function getCachedSegmenter(locale: string | undefined, granularity: TextSegmentGranularity): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') return null;
  const key = `${locale ?? ''}|${granularity}`;
  const existing = _segmenterCache.get(key);
  if (existing !== undefined) return existing;

  const built = new Intl.Segmenter(locale, { granularity });
  if (_segmenterCache.size >= _segmenterCacheCapacity) {
    const oldest = _segmenterCache.keys().next().value;
    if (oldest !== undefined) _segmenterCache.delete(oldest);
  }
  _segmenterCache.set(key, built);
  return built;
}

function segmentWithIntlSegmenter(
  text: string,
  granularity: TextSegmentGranularity,
  locale?: string,
): readonly TextSegment[] {
  const segmenter = getCachedSegmenter(locale, granularity);
  if (segmenter === null) return [];

  const out: TextSegment[] = [];
  const isWordGranularity = granularity === 'word';
  for (const data of segmenter.segment(text)) {
    const start = data.index;
    const record: TextSegment = { start, end: start + data.segment.length, text: data.segment };
    // isWordLike is only meaningful — and only reported — for word granularity.
    if (isWordGranularity) record.isWordLike = data.isWordLike ?? false;
    out.push(record);
  }
  return out;
}
