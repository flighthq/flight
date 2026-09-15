import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  FontMetrics,
  GlyphExtents,
  HostTextShaperProvider,
  ShapeRunOptions,
  ShapedRun,
  TextFormat,
} from '@flighthq/types/contract';

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
  const out = allocateEntity<ShapedRun & Entity>();
  initializeShapedRun(out);
  return finishEntity(out);
}

export function getCodePointForGlyph(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  glyphId: number,
  _format: Readonly<TextFormat>,
): number {
  if (!hostTextShaper.getCodePointForGlyph) return -1;
  return hostTextShaper.getCodePointForGlyph(glyphId);
}

export function getFontMetrics(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  format: Readonly<TextFormat>,
): FontMetrics | null {
  if (!hostTextShaper.getFontMetrics) return null;
  return hostTextShaper.getFontMetrics(format);
}

export function getFontMetricsInto(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  format: Readonly<TextFormat>,
  out: FontMetrics,
): boolean {
  const metrics = getFontMetrics(hostTextShaper, format);
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

export function getFontUnitScale(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  format: Readonly<TextFormat>,
): number {
  const metrics = getFontMetrics(hostTextShaper, format);
  if (metrics === null) return -1;
  const size = format.size ?? 12;
  return size / metrics.unitsPerEm;
}

export function getGlyphExtents(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  glyphId: number,
  _format: Readonly<TextFormat>,
): GlyphExtents | null {
  if (!hostTextShaper.getGlyphExtents) return null;
  return hostTextShaper.getGlyphExtents(glyphId);
}

export function getGlyphExtentsBatch(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  glyphIds: ReadonlyArray<number>,
  _format: Readonly<TextFormat>,
  out: GlyphExtents[],
): number {
  if (!hostTextShaper.getGlyphExtents) return 0;
  let resolved = 0;
  for (let i = 0; i < glyphIds.length; i++) {
    const extents = hostTextShaper.getGlyphExtents(glyphIds[i]);
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
  hostTextShaper: Readonly<HostTextShaperProvider>,
  glyphId: number,
  _format: Readonly<TextFormat>,
  out: GlyphExtents,
): boolean {
  const extents = getGlyphExtents(hostTextShaper, glyphId, _format);
  if (extents === null) return false;
  out.height = extents.height;
  out.width = extents.width;
  out.xBearing = extents.xBearing;
  out.yBearing = extents.yBearing;
  return true;
}

export function getGlyphIndexForCodePoint(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  codePoint: number,
  _format: Readonly<TextFormat>,
): number {
  if (!hostTextShaper.getGlyphIndexForCodePoint) return -1;
  return hostTextShaper.getGlyphIndexForCodePoint(codePoint);
}

export function getGlyphName(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  glyphId: number,
  _format: Readonly<TextFormat>,
): string {
  if (!hostTextShaper.getGlyphName) return '';
  return hostTextShaper.getGlyphName(glyphId);
}

export function initializeShapedRun(out: EntityConstruction<ShapedRun & Entity>): void {
  out.advanceWidth = 0;
  out.direction = 'LeftToRight';
  out.font = null;
  out.glyphCount = 0;
  out.glyphs = [];
  out.script = '';
}

export function shapeTextRun(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  text: string,
  format: Readonly<TextFormat>,
  options?: ShapeRunOptions,
): ShapedRun | null {
  if (!hostTextShaper.shapeRun) return null;
  return hostTextShaper.shapeRun(text, format, options);
}

export function shapeTextRunInto(
  hostTextShaper: Readonly<HostTextShaperProvider>,
  text: string,
  format: Readonly<TextFormat>,
  out: ShapedRun,
  options?: ShapeRunOptions,
): boolean {
  if (!hostTextShaper.shapeRun) return false;
  const result = hostTextShaper.shapeRun(text, format, options);
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
