import type { TextMeasureFunction } from './TextLayout';

// Text-shaping seam. Free functions in @flighthq/textshaper delegate to the active TextShaperBackend
// (a canvas/advances-only backend from @flighthq/textshaper-canvas today, a future HarfBuzz backend
// from @flighthq/textshaper-harfbuzz). Shaping turns a string + format into the horizontal advance
// the layout engine needs to place text.
//
// This formalizes the existing TextMeasureFunction contract as a swappable backend: measureText has
// the exact signature of a TextMeasureFunction, so a backend's measureText is a TextMeasureFunction
// and any TextMeasureFunction can wrap a backend. Today shaping is advances-only (no clusters, bidi,
// or font features) — that is what canvas measureText provides and what text-layout consumes. A richer
// backend (HarfBuzz) implements the same measureText and may, in future, add cluster/glyph methods
// here without breaking advances-only callers.
export interface TextShaperBackend {
  // Returns the horizontal advance width, in pixels, of `text` rendered in `format`. Identical in
  // shape to TextMeasureFunction; text-layout calls this once per character (and per adjacent pair,
  // to recover kerning) to build per-character advance positions.
  measureText: TextMeasureFunction;
}
