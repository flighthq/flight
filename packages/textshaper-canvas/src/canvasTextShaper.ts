import { computeTextFormatFontString } from '@flighthq/render';
import type { FontMetrics, TextFormat, TextShaperBackend } from '@flighthq/types';

// Clears the advance cache on a backend returned by createCanvasTextShaperBackend. Call this after
// a webfont finishes loading — document.fonts.ready resolves, FontFaceObserver fires, etc. — so
// previously-cached advances are recomputed with the new font metrics. This is a no-op on the
// sentinel backend returned when no canvas context is available.
export function clearCanvasTextShaperBackendCache(backend: CanvasTextShaperBackend): void {
  backend.clearCache();
}

// Builds the Canvas 2D text-shaper backend: advances-only shaping over a private context's
// measureText, plus font-level metrics derived from TextMetrics bounding-box fields. Install it
// once during setup via setTextShaperBackend(createCanvasTextShaperBackend()) so text-layout can
// measure text for metrics and autoSize bounds outside the render pass.
//
// Uses the same canvas measureText and font string (computeTextFormatFontString) the renderers use,
// so shaped advances match what gets rasterized. Each backend instance owns exactly one private
// canvas + 2D context — no shared global state, no top-level side effects. The canvas is either
// an OffscreenCanvas (worker-safe, no DOM required) or a detached HTMLCanvasElement. In
// non-DOM, non-worker environments where neither is available, createCanvasTextShaperBackend()
// returns a sentinel backend that yields -1 for advances and null for metrics.
//
// Advance results are memoized in a per-backend LRU cache keyed by (font-string, text). Call
// clearCanvasTextShaperBackendCache(backend) to invalidate after a webfont loads and changes
// metrics for previously-measured strings.
//
// This is the extraction of the former createCanvasTextMeasure — the SDK's existing measurement,
// formalized as a TextShaperBackend.
export function createCanvasTextShaperBackend(): CanvasTextShaperBackend {
  const ctx = _createContext();
  if (ctx === null) {
    return _createSentinelBackend();
  }

  // One-time feature-detect: modern Canvas letterSpacing/wordSpacing (Chrome 99+, Firefox 117+).
  // Older engines simply do not apply the property; we set it unconditionally on modern engines.
  const supportsLetterSpacing = 'letterSpacing' in ctx;
  const supportsWordSpacing = 'wordSpacing' in ctx;
  const supportsDirection = 'direction' in ctx;

  // Bounded advance cache: keyed by `${fontString}\x00${text}`. Evicts the oldest entry when the
  // cache reaches _CACHE_MAX_SIZE, keeping allocation bounded on hot-path layout measurement.
  const cache = new Map<string, number>();

  const backend: CanvasTextShaperBackend = {
    clearCache(): void {
      cache.clear();
    },

    getFontMetrics(format: Readonly<TextFormat>): FontMetrics | null {
      const fontString = computeTextFormatFontString(format);
      ctx.font = fontString;

      // Probe strings chosen to expose the font's cap-height and x-height ink extents.
      const capMeasure = ctx.measureText('H');
      const xMeasure = ctx.measureText('x');

      // fontBoundingBoxAscent/Descent are the reliable font-level values (defined even for
      // whitespace-only strings). actualBoundingBoxAscent gives the ink ascent above the baseline.
      const ascent = capMeasure.fontBoundingBoxAscent ?? capMeasure.actualBoundingBoxAscent;
      const descent = capMeasure.fontBoundingBoxDescent ?? capMeasure.actualBoundingBoxDescent;

      // Canvas does not expose OS/2 table fields (unitsPerEm, lineGap, underline metrics). We
      // provide size-relative estimates consistent with typical web-font conventions. These are
      // safe for layout; a full-glyph backend (HarfBuzz) will override them with exact values.
      const size = format.size ?? 12;

      return {
        ascent,
        capHeight: capMeasure.actualBoundingBoxAscent,
        descent,
        lineGap: 0,
        underlinePosition: -(size * 0.1),
        underlineThickness: Math.max(1, size * 0.05),
        unitsPerEm: 0, // not accessible from Canvas; 0 signals "unavailable"
        xHeight: xMeasure.actualBoundingBoxAscent,
      };
    },

    measureText(text: string, format: Readonly<TextFormat>): number {
      const fontString = computeTextFormatFontString(format);
      const cacheKey = `${fontString}\x00${text}`;

      const cached = cache.get(cacheKey);
      if (cached !== undefined) return cached;

      ctx.font = fontString;

      // Plumb letterSpacing and wordSpacing so measured advances match the Canvas renderer which
      // also sets these properties when drawing. Guard with the one-time feature-detect so older
      // engines silently no-op rather than throwing.
      if (supportsLetterSpacing) {
        (ctx as unknown as Record<string, unknown>)['letterSpacing'] = `${format.letterSpacing ?? 0}px`;
      }
      if (supportsWordSpacing) {
        (ctx as unknown as Record<string, unknown>)['wordSpacing'] = `0px`;
      }
      // Set direction explicitly so RTL advances match rasterization. TextFormat does not carry a
      // direction field today; we default to 'ltr' here and document the limitation. When
      // TextFormat gains a direction field, replace this hardcoded value.
      if (supportsDirection) {
        (ctx as unknown as Record<string, unknown>)['direction'] = 'ltr';
      }

      const width = ctx.measureText(text).width;

      // Evict oldest entry when the cache is full.
      if (cache.size >= _CACHE_MAX_SIZE) {
        cache.delete(cache.keys().next().value as string);
      }
      cache.set(cacheKey, width);
      return width;
    },
  };

  return backend;
}

// The full type returned by createCanvasTextShaperBackend. Extends TextShaperBackend with the
// explicit cache-clear method. Callers that only need the seam contract can hold this as
// TextShaperBackend; callers that manage font loading hold it as CanvasTextShaperBackend to call
// clearCanvasTextShaperBackendCache.
export interface CanvasTextShaperBackend extends TextShaperBackend {
  clearCache(): void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Max number of (font, text) pairs held in the per-backend advance cache. Chosen to cover a
// typical paragraph of mixed formats without unbounded growth. ~2 KB at 64 bytes/key average.
const _CACHE_MAX_SIZE = 512;

// Returns a 2D context from OffscreenCanvas (worker-safe, no DOM) when available, falling back
// to a detached HTMLCanvasElement (DOM required). Returns null when neither is available — the
// sentinel backend path.
function _createContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  // Prefer OffscreenCanvas: available in Workers and modern browsers without touching the DOM.
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const offscreen = new OffscreenCanvas(0, 0);
      const ctx = offscreen.getContext('2d');
      if (ctx !== null) return ctx;
    } catch {
      // OffscreenCanvas exists but getContext('2d') failed; fall through to HTMLCanvasElement.
    }
  }
  // Fall back to a detached HTMLCanvasElement in DOM environments.
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      return canvas.getContext('2d');
    } catch {
      // DOM present but canvas creation failed; return null to trigger sentinel path.
    }
  }
  return null;
}

// Returns a sentinel backend that yields -1 for measureText and null for getFontMetrics. Used in
// non-DOM, non-OffscreenCanvas environments (SSR, workers without OffscreenCanvas support) so
// callers receive the documented sentinel values rather than a throw at construction time. The
// clearCache no-op satisfies the CanvasTextShaperBackend contract.
function _createSentinelBackend(): CanvasTextShaperBackend {
  return {
    clearCache(): void {
      // No-op: no cache in the sentinel path.
    },
    getFontMetrics(_format: Readonly<TextFormat>): FontMetrics | null {
      return null;
    },
    measureText(_text: string, _format: Readonly<TextFormat>): number {
      return -1;
    },
  };
}
