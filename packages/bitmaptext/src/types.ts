import type { Rectangle } from '@flighthq/geometry/contract';
import type { GlyphSource } from '@flighthq/glyphatlas/contract';
import type { Node2D, Node2DData, Node2DRuntime } from '@flighthq/scene2d/contract';
import type { TextureAtlas } from '@flighthq/types/contract';

// Horizontal alignment of each laid-out line within the text block. `justify` stretches inter-word
// gaps to fill the wrap width (the last line of a paragraph stays left-aligned); it degrades to
// `left` when no `wrapWidth` is set, since there is no target width to justify to.
export type BitmapTextAlign = 'center' | 'justify' | 'left' | 'right';

// The QuadBatch-batched bitmap text display node — a first-class leaf that owns its glyph quads (one
// `BitmapTextPage` per glyph-atlas page) and draws them through its own per-backend renderer.
export interface BitmapTextData extends Node2DData {
  align: BitmapTextAlign;
  ellipsis: string;
  glyphSource: GlyphSource | null;
  letterSpacing: number;
  lineHeight: number;
  maxLines: number | null;
  text: string;
  wrapWidth: number | null;
}

// One glyph-atlas page's drawable quad data owned directly by a BitmapText node.
export interface BitmapTextPage {
  atlas: TextureAtlas;
  ids: Uint16Array;
  instanceCount: number;
  transforms: Float32Array;
}

export interface BitmapTextRuntime extends Node2DRuntime {
  glyphLayoutVersion: number;
  lineCount: number;
  localBoundsRectangle: Rectangle | null;
  pages: BitmapTextPage[];
  truncated: boolean;
}

export interface BitmapText extends Node2D {
  data: BitmapTextData;
}

export interface BitmapTextOptions {
  align?: BitmapTextAlign;
  ellipsis?: string;
  letterSpacing?: number;
  lineHeight?: number;
  maxLines?: number | null;
  text?: string;
  wrapWidth?: number | null;
}

export interface BitmapTextMissingGlyphs {
  missingCodepoints: readonly number[];
  totalCodepoints: number;
}

export const BitmapTextKind = 'BitmapText';
