import type { FontMetrics } from './FontMetrics';
import type { GlyphExtents } from './GlyphExtents';
import type { ShapedRun } from './ShapedRun';
import type { TextDirection } from './TextDirection';
import type { TextFormat } from './TextFormat';
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

// Options passed to TextShaperBackend.shapeRun for run-level shaping hints.
export interface ShapeRunOptions {
  direction?: TextDirection;
  script?: string;
}

export interface TextShaperBackend {
  // Returns the unicode code point that produced `glyphId`, or -1 if unknown. Reverse map of
  // getGlyphIndexForCodePoint; useful for hit-testing and accessibility.
  getCodePointForGlyph?: (glyphId: number) => number;
  // Returns font-level metrics (ascent, descent, unitsPerEm, etc.) for the given format, or null
  // if the backend cannot provide them.
  getFontMetrics?: (format: Readonly<TextFormat>) => FontMetrics | null;
  // Returns the ink bounding box for a single glyph, or null if the glyph is unknown or the
  // backend does not support per-glyph extents.
  getGlyphExtents?: (glyphId: number) => GlyphExtents | null;
  // Returns the glyph index for a unicode code point, or -1 if the font has no glyph for it.
  getGlyphIndexForCodePoint?: (codePoint: number) => number;
  // Returns the PostScript name for a glyph, or an empty string if the backend cannot name it.
  getGlyphName?: (glyphId: number) => string;
  // Returns the horizontal advance width, in pixels, of `text` rendered in `format`. Identical in
  // shape to TextMeasureFunction; text-layout calls this once per character (and per adjacent pair,
  // to recover kerning) to build per-character advance positions.
  measureText: TextMeasureFunction;
  // Shapes a text run — applies font features, bidi, and cluster mapping — returning a ShapedRun
  // with per-glyph ids, advances, and offsets. Only richer backends (HarfBuzz) implement this;
  // the advances-only canvas backend does not.
  shapeRun?: (text: string, format: Readonly<TextFormat>, options?: Readonly<ShapeRunOptions>) => ShapedRun;
}
