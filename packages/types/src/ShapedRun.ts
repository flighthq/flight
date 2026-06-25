import type { FontResource } from './FontResource';

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
  direction: 'LeftToRight' | 'RightToLeft';
  font: FontResource | null;
  glyphCount: number;
  glyphs: ShapedGlyph[];
  script: string;
}
