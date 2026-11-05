import type { FontResource } from '@flighthq/font/contract';

import type { TextDirection } from './TextDirection.ts';

export interface ShapedGlyph {
  cluster: number;
  glyphId: number;
  xAdvance: number;
  xOffset: number;
  yAdvance: number;
  yOffset: number;
}

export interface ShapedRun {
  advanceWidth: number;
  direction: TextDirection;
  font: FontResource | null;
  // Valid glyph count; glyphs may be over-allocated as a reusable buffer.
  glyphCount: number;
  glyphs: ShapedGlyph[];
  script: string;
}
