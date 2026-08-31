import type { GlyphSource } from './GlyphSource';
import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';
import type { Rectangle } from './Rectangle';
import type { TextureAtlas } from './TextureAtlas';

// Horizontal alignment of each laid-out line within the text block. `justify` stretches inter-word
// gaps to fill the wrap width (the last line of a paragraph stays left-aligned); it degrades to
// `left` when no `wrapWidth` is set, since there is no target width to justify to.
export type BitmapTextAlign = 'center' | 'justify' | 'left' | 'right';

// The QuadBatch-batched bitmap text display node — a first-class leaf that owns its glyph quads (one
// `BitmapTextPage` per glyph-atlas page) and draws them through its own per-backend renderer, the same
// shape as `Tilemap`. It lays out a string's glyphs from a `GlyphSource` (per-glyph atlas rect, advance,
// bearing, kerning, line metrics) and emits one glyph quad per visible glyph into the page whose
// `GlyphEntry.page` it belongs to. Tint is not a bitmap-text concern: it is the node's generic
// color-adjustment stack (`setNodeColorAdjustmentsTint`), folded on the backends that realize adjustments.
export interface BitmapTextData extends Node2DData {
  align: BitmapTextAlign;
  // The bound glyph source supplying per-glyph atlas rects, advances, kerning, and line metrics. A
  // live runtime binding (a method object), NOT serializable — a scene serialized with a BitmapText
  // must re-bind this on load, the same way `ParticleEmitterData.atlas` and `MovieClipData.timeline`
  // hold runtime references that do not round-trip as plain data. Null lays out nothing.
  glyphSource: GlyphSource | null;
  // Extra advance in pixels added after every glyph and space. 0 = the source's natural advances.
  letterSpacing: number;
  // Multiplier on the metric line advance (`ascent + descent + lineGap`). 1 = metrics-driven spacing.
  lineHeight: number;
  text: string;
  // Wrap width in pixels; a line breaks at the last word boundary that fits. Null disables wrapping.
  wrapWidth: number | null;
}

// One glyph-atlas page's drawable quad data owned directly by a BitmapText node (page-indexed in
// `BitmapTextRuntime.pages`). `atlas` binds the page's image and holds its glyph rects (rebuilt each
// layout); `ids` indexes those regions per quad; `transforms` holds the vector2 (translation-only) pen
// position of each glyph quad, two floats per quad; `instanceCount` is the live glyph count (capacity is
// retained across layouts). The per-backend BitmapText renderer draws each page as one batched pass.
export interface BitmapTextPage {
  atlas: TextureAtlas;
  ids: Uint16Array;
  instanceCount: number;
  transforms: Float32Array;
}

export interface BitmapTextRuntime extends Node2DRuntime {
  // The `GlyphSource.getGlyphLayoutVersion()` the baked page regions were built against, stamped by
  // `updateBitmapText`. `-1` before the first layout, which is why a never-updated node reads stale.
  // `isBitmapTextGlyphLayoutStale` compares it to the source's current version, and
  // `refreshBitmapTextGlyphLayout` re-lays-out when they differ — without it, a repack that relocated
  // the glyphs leaves these pages sampling whatever now occupies their rects.
  glyphLayoutVersion: number;
  // Cached local bounds of the laid-out text, written by `updateBitmapText` and copied out by
  // `computeBitmapTextLocalBoundsRectangle`. Null before the first layout.
  localBoundsRectangle: Rectangle | null;
  // The glyph-quad pages `updateBitmapText` fills — one per glyph-atlas page, page-indexed. Each holds
  // the quads of glyphs whose `GlyphEntry.page` matches its index, sampling that page's atlas image
  // (from `getGlyphAtlasImage(page)`) through its own `TextureAtlas`. A single-page source yields exactly
  // one page. Created by `createBitmapText` (page 0) and grown by `updateBitmapText`.
  pages: BitmapTextPage[];
}

export interface BitmapText extends Node2D {
  data: BitmapTextData;
}

// Construction/mutation options for a BitmapText. Every field is optional; omitted fields take the
// node's defaults (`left` align, no wrap, no letter spacing, 1× line height, empty text).
export interface BitmapTextOptions {
  align?: BitmapTextAlign;
  letterSpacing?: number;
  lineHeight?: number;
  text?: string;
  wrapWidth?: number | null;
}

export const BitmapTextKind = 'BitmapText';
