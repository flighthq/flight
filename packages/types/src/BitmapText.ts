import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { GlyphSource } from './GlyphSource';
import type { QuadBatch } from './QuadBatch';
import type { Rectangle } from './Rectangle';

// Horizontal alignment of each laid-out line within the text block. `justify` stretches inter-word
// gaps to fill the wrap width (the last line of a paragraph stays left-aligned); it degrades to
// `left` when no `wrapWidth` is set, since there is no target width to justify to.
export type BitmapTextAlign = 'center' | 'justify' | 'left' | 'right';

// The QuadBatch-backed bitmap text display node. It lays out a string's glyphs from a `GlyphSource`
// (per-glyph atlas rect, advance, bearing, kerning, line metrics) and emits one glyph quad per
// visible glyph into a backing `@flighthq/sprite` QuadBatch — a single batched draw over the glyph
// atlas texture. It is the composition-layer sibling of `MovieClip` (over a timeline) and
// `ParticleEmitter` (over a particle sim): a display node assembled from lower primitives.
//
// The node registers no GPU renderer. Its backing QuadBatch (on `BitmapTextRuntime.quadBatch`) is a
// real child in the display hierarchy, so the existing QuadBatch renderer draws it — the same way a
// `MovieClip` renders through its child display objects.
export interface BitmapTextData extends DisplayObjectData {
  align: BitmapTextAlign;
  // Packed RGBA tint (`0xRRGGBBAA`) multiplied over the glyph pixels. `0xffffffff` (white) is the
  // untinted default and leaves the backing batch material-free; any other value sets a
  // UniformColorTransformMaterial on the batch (which needs a registered material renderer to show).
  color: number;
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

export interface BitmapTextRuntime extends DisplayObjectRuntime {
  // Cached local bounds of the laid-out text, written by `updateBitmapText` and copied out by
  // `computeBitmapTextLocalBoundsRectangle`. Null before the first layout.
  localBoundsRectangle: Rectangle | null;
  // The backing QuadBatch `updateBitmapText` fills — one quad per visible glyph, sampling the glyph
  // atlas texture through the batch's own `TextureAtlas` (whose regions are the glyph rects). Added as
  // this node's child so the standard QuadBatch renderer draws it. Null until `createBitmapText`.
  quadBatch: QuadBatch | null;
}

export interface BitmapText extends DisplayObject {
  data: BitmapTextData;
}

// Construction/mutation options for a BitmapText. Every field is optional; omitted fields take the
// node's defaults (`left` align, white tint, no wrap, no letter spacing, 1× line height, empty text).
export interface BitmapTextOptions {
  align?: BitmapTextAlign;
  color?: number;
  letterSpacing?: number;
  lineHeight?: number;
  text?: string;
  wrapWidth?: number | null;
}

export const BitmapTextKind = 'BitmapText';
