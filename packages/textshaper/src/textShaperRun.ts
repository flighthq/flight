import type { FontMetrics, GlyphExtents, ShapedRun, ShapeRunOptions, TextFormat } from '@flighthq/types';

import { getTextShaperBackend } from './textShaper';

export function clearShapedRun(run: ShapedRun): ShapedRun {
  run.advanceWidth = 0;
  run.direction = 'LeftToRight';
  run.font = null;
  run.glyphCount = 0;
  run.glyphs.length = 0;
  run.script = '';
  return run;
}

export function createShapedRun(): ShapedRun {
  return {
    advanceWidth: 0,
    direction: 'LeftToRight',
    font: null,
    glyphCount: 0,
    glyphs: [],
    script: '',
  };
}

export function getCodePointForGlyph(glyphId: number, _format: Readonly<TextFormat>): number {
  const backend = getTextShaperBackend();
  if (backend === null || !backend.getCodePointForGlyph) return -1;
  return backend.getCodePointForGlyph(glyphId);
}

export function getFontMetrics(format: Readonly<TextFormat>): FontMetrics | null {
  const backend = getTextShaperBackend();
  if (backend === null || !backend.getFontMetrics) return null;
  return backend.getFontMetrics(format);
}

export function getFontMetricsInto(format: Readonly<TextFormat>, out: FontMetrics): boolean {
  const metrics = getFontMetrics(format);
  if (metrics === null) return false;
  out.ascent = metrics.ascent;
  out.capHeight = metrics.capHeight;
  out.descent = metrics.descent;
  out.lineGap = metrics.lineGap;
  out.underlinePosition = metrics.underlinePosition;
  out.underlineThickness = metrics.underlineThickness;
  out.unitsPerEm = metrics.unitsPerEm;
  out.xHeight = metrics.xHeight;
  return true;
}

export function getFontUnitScale(format: Readonly<TextFormat>): number {
  const metrics = getFontMetrics(format);
  if (metrics === null) return -1;
  const size = (format as { size?: number }).size ?? 12;
  return size / metrics.unitsPerEm;
}

export function getGlyphExtents(glyphId: number, _format: Readonly<TextFormat>): GlyphExtents | null {
  const backend = getTextShaperBackend();
  if (backend === null || !backend.getGlyphExtents) return null;
  return backend.getGlyphExtents(glyphId);
}

export function getGlyphExtentsBatch(
  glyphIds: ReadonlyArray<number>,
  format: Readonly<TextFormat>,
  out: GlyphExtents[],
): number {
  const backend = getTextShaperBackend();
  if (backend === null || !backend.getGlyphExtents) return 0;
  let resolved = 0;
  for (let i = 0; i < glyphIds.length; i++) {
    const extents = backend.getGlyphExtents(glyphIds[i]);
    if (extents !== null) {
      out[i] = extents;
      resolved++;
    } else {
      out[i] = { height: 0, width: 0, xBearing: 0, yBearing: 0 };
    }
  }
  return resolved;
}

export function getGlyphExtentsInto(glyphId: number, format: Readonly<TextFormat>, out: GlyphExtents): boolean {
  const extents = getGlyphExtents(glyphId, format);
  if (extents === null) return false;
  out.height = extents.height;
  out.width = extents.width;
  out.xBearing = extents.xBearing;
  out.yBearing = extents.yBearing;
  return true;
}

export function getGlyphIndexForCodePoint(codePoint: number, _format: Readonly<TextFormat>): number {
  const backend = getTextShaperBackend();
  if (backend === null || !backend.getGlyphIndexForCodePoint) return -1;
  return backend.getGlyphIndexForCodePoint(codePoint);
}

export function getGlyphName(glyphId: number, _format: Readonly<TextFormat>): string {
  const backend = getTextShaperBackend();
  if (backend === null || !backend.getGlyphName) return '';
  return backend.getGlyphName(glyphId);
}

export function shapeTextRun(text: string, format: Readonly<TextFormat>, options?: ShapeRunOptions): ShapedRun | null {
  const backend = getTextShaperBackend();
  if (backend === null || !backend.shapeRun) return null;
  return backend.shapeRun(text, format, options);
}

export function shapeTextRunInto(text: string, format: Readonly<TextFormat>, out: ShapedRun): boolean {
  const backend = getTextShaperBackend();
  if (backend === null || !backend.shapeRun) return false;
  const result = backend.shapeRun(text, format);
  const glyphs = out.glyphs;
  out.advanceWidth = result.advanceWidth;
  out.direction = result.direction;
  out.font = result.font;
  out.glyphCount = result.glyphCount;
  out.script = result.script;
  glyphs.length = 0;
  for (let i = 0; i < result.glyphs.length; i++) {
    glyphs.push(result.glyphs[i]);
  }
  out.glyphs = glyphs;
  return true;
}
