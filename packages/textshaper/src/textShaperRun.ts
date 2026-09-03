import { createEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  FontMetrics,
  GlyphExtents,
  HasTextShaper,
  ShapedRun,
  ShapeRunOptions,
  TextFormat,
} from '@flighthq/types/contract';

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

export function createShapedRun(): ShapedRun & Entity {
  return createEntity({
    advanceWidth: 0,
    direction: 'LeftToRight',
    font: null,
    glyphCount: 0,
    glyphs: [],
    script: '',
  });
}

export function getCodePointForGlyph(glyphId: number, _format: Readonly<TextFormat>, host?: HasTextShaper): number {
  const backend = getTextShaperBackend(host);
  if (backend === null || !backend.getCodePointForGlyph) return -1;
  return backend.getCodePointForGlyph(glyphId);
}

export function getFontMetrics(format: Readonly<TextFormat>, host?: HasTextShaper): FontMetrics | null {
  const backend = getTextShaperBackend(host);
  if (backend === null || !backend.getFontMetrics) return null;
  return backend.getFontMetrics(format);
}

export function getFontMetricsInto(format: Readonly<TextFormat>, out: FontMetrics, host?: HasTextShaper): boolean {
  const metrics = getFontMetrics(format, host);
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

export function getFontUnitScale(format: Readonly<TextFormat>, host?: HasTextShaper): number {
  const metrics = getFontMetrics(format, host);
  if (metrics === null) return -1;
  const size = format.size ?? 12;
  return size / metrics.unitsPerEm;
}

export function getGlyphExtents(
  glyphId: number,
  _format: Readonly<TextFormat>,
  host?: HasTextShaper,
): GlyphExtents | null {
  const backend = getTextShaperBackend(host);
  if (backend === null || !backend.getGlyphExtents) return null;
  return backend.getGlyphExtents(glyphId);
}

export function getGlyphExtentsBatch(
  glyphIds: ReadonlyArray<number>,
  _format: Readonly<TextFormat>,
  out: GlyphExtents[],
  host?: HasTextShaper,
): number {
  const backend = getTextShaperBackend(host);
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

export function getGlyphExtentsInto(
  glyphId: number,
  _format: Readonly<TextFormat>,
  out: GlyphExtents,
  host?: HasTextShaper,
): boolean {
  const extents = getGlyphExtents(glyphId, _format, host);
  if (extents === null) return false;
  out.height = extents.height;
  out.width = extents.width;
  out.xBearing = extents.xBearing;
  out.yBearing = extents.yBearing;
  return true;
}

export function getGlyphIndexForCodePoint(
  codePoint: number,
  _format: Readonly<TextFormat>,
  host?: HasTextShaper,
): number {
  const backend = getTextShaperBackend(host);
  if (backend === null || !backend.getGlyphIndexForCodePoint) return -1;
  return backend.getGlyphIndexForCodePoint(codePoint);
}

export function getGlyphName(glyphId: number, _format: Readonly<TextFormat>, host?: HasTextShaper): string {
  const backend = getTextShaperBackend(host);
  if (backend === null || !backend.getGlyphName) return '';
  return backend.getGlyphName(glyphId);
}

export function shapeTextRun(
  text: string,
  format: Readonly<TextFormat>,
  options?: ShapeRunOptions,
  host?: HasTextShaper,
): ShapedRun | null {
  const backend = getTextShaperBackend(host);
  if (backend === null || !backend.shapeRun) return null;
  return backend.shapeRun(text, format, options);
}

export function shapeTextRunInto(
  text: string,
  format: Readonly<TextFormat>,
  out: ShapedRun,
  options?: ShapeRunOptions,
  host?: HasTextShaper,
): boolean {
  const backend = getTextShaperBackend(host);
  if (backend === null || !backend.shapeRun) return false;
  const result = backend.shapeRun(text, format, options);
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
