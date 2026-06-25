import type { ShapedRun, ShapeRunOptions, TextFormat } from '@flighthq/types';

import { shapeTextRun } from './textShaperRun';

export interface TextShaperCache {
  readonly _entries: Map<string, ShapedRun>;
}

// Clears all cached ShapedRuns from `cache`, releasing their references. The cache remains valid
// for continued use after clearing. Does not release the cache object itself (use
// `disposeTextShaperCache` for that).
export function clearTextShaperCache(cache: TextShaperCache): void {
  cache._entries.clear();
}

// Allocates a new, empty TextShaperCache.
export function createTextShaperCache(): TextShaperCache {
  return { _entries: new Map() };
}

// Releases the `cache` object and all cached ShapedRuns. The cache must not be used after this
// call. Prefer `clearTextShaperCache` when you want to reuse the cache object; use
// `disposeTextShaperCache` only when the cache lifetime is over.
export function disposeTextShaperCache(cache: TextShaperCache): void {
  cache._entries.clear();
}

// Shapes `text` in `format` with `options`, returning a cached ShapedRun when an equivalent call
// was made earlier in this cache's lifetime. Calls `shapeTextRun` on miss and stores the result.
// Returns null when no backend is registered or the backend is advances-only (same as
// `shapeTextRun`); null results are NOT cached so a later backend registration can succeed.
export function shapeTextRunCached(
  cache: TextShaperCache,
  text: string,
  format: Readonly<TextFormat>,
  options?: Readonly<ShapeRunOptions>,
): ShapedRun | null {
  const key = _makeCacheKey(text, format, options);
  const existing = cache._entries.get(key);
  if (existing !== undefined) return existing;
  const result = shapeTextRun(text, format, options);
  if (result !== null) cache._entries.set(key, result);
  return result;
}

// Builds a stable cache key from the shaping parameters. The key encodes all fields that affect
// the shaped output so distinct inputs do not collide. Format fields that are undefined are
// omitted; options fields that are undefined are omitted.
function _makeCacheKey(text: string, format: Readonly<TextFormat>, options?: Readonly<ShapeRunOptions>): string {
  // Format fields that affect shaping: font identity, size, bold, italic, kerning, letterSpacing.
  const fmt = [
    format.font ?? '',
    format.size ?? 12,
    format.bold ? 1 : 0,
    format.italic ? 1 : 0,
    format.kerning ? 1 : 0,
    format.letterSpacing ?? 0,
  ].join('\x01');
  // Options: direction, script.
  let opts = '';
  if (options !== undefined) {
    const dir = options.direction ?? '';
    const script = options.script ?? '';
    opts = `${dir}\x01${script}`;
  }
  return `${text}\x00${fmt}\x00${opts}`;
}
