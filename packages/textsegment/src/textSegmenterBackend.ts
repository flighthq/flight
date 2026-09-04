import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  HasTextSegmenter,
  TextSegment,
  TextSegmentGranularity,
  TextSegmenterBackend,
} from '@flighthq/types/contract';

// Builds the default web backend: a wrapper over the browser-native Intl.Segmenter. It ships no
// Unicode tables — the engine already carries them — so the common path costs nothing in bundle
// weight. Intl.Segmenter instances are cached by (locale, granularity) because constructing one is
// expensive relative to a single segment() call. Where Intl.Segmenter is absent (an old or headless
// engine), segment() returns [] rather than throwing; compose a from-scratch UAX #29 backend into
// the host for those environments.
export function createWebTextSegmenterBackend(): TextSegmenterBackend {
  const out = allocateEntity<TextSegmenterBackend>();
  out.segment = segmentWithIntlSegmenter;
  return finishEntity(out);
}

// Stable bundled web provider. Hosts can import this directly when composing their explicit
// capability object; callers that omit a host receive it as the final fallback.
export const webTextSegmenterBackend: TextSegmenterBackend = createWebTextSegmenterBackend();

// Returns the explicit host's provider when supplied, then the legacy installed backend, and
// finally the bundled web provider. The explicit dependency always wins, so independent callers
// can interleave different hosts without mutating shared capability state.
export function getTextSegmenterBackend(host?: HasTextSegmenter): TextSegmenterBackend {
  return host?.text.segmenter ?? _backend ?? webTextSegmenterBackend;
}

/**
 * Installs the backend used by calls that omit an explicit host; pass null to restore the stable
 * bundled web default.
 *
 * @deprecated Pass a HasTextSegmenter to the segmentation or boundary operation. Retained for
 * source compatibility until the legacy global path is removed.
 */
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
