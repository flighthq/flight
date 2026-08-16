import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createPath, getPathBounds, transformPath } from '@flighthq/path/contract';
import {
  appendShapeBeginFill,
  appendShapeCurveTo,
  appendShapeEndFill,
  appendShapeLineTo,
  appendShapeMoveTo,
  createShape,
  getShapeFillRegions,
} from '@flighthq/shape/contract';
import type { GlyphOutlineSource, ImportDiagnostic, Path, RectangleLike, Shape } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, PathCommand } from '@flighthq/types/contract';

import { SwfReader } from './swfReader';
import { createSwfGlyphShape } from './swfShape';

// Composes a static text definition into one Shape. A text record carries glyph indices and advances
// rather than characters, so this is placement, not layout: each glyph's outline is emitted at the pen
// position, scaled from the font's EM grid to the record's height, and the pen advances by the amount the
// file recorded. The definition's own matrix is baked into the geometry because it belongs to the
// character rather than to any one placement of it.
export function createSwfTextShape(
  reader: SwfReader,
  version: number,
  fonts: ReadonlyMap<number, GlyphOutlineSource>,
): Shape | null {
  const glyphBits = reader.readUint8();
  const advanceBits = reader.readUint8();
  if (!reader.valid) return null;

  const shape = createShape();
  const glyphOutline = createPath();
  let font: GlyphOutlineSource | null = null;
  let unitsPerEm = DEFAULT_FONT_UNITS_PER_EM;
  let color = 0x000000ff;
  let height = 0;
  let x = 0;
  let y = 0;

  for (let records = 0; records < MAX_TEXT_RECORDS; records++) {
    const flags = reader.readUint8();
    if (!reader.valid) return null;
    if (flags === 0) return shape;
    if ((flags & TEXT_RECORD_TYPE) === 0) return null;

    if ((flags & TEXT_HAS_FONT) !== 0) {
      const fontId = reader.readUint16();
      font = fonts.get(fontId) ?? null;
      unitsPerEm = font?.getGlyphOutlineMetrics().unitsPerEm ?? DEFAULT_FONT_UNITS_PER_EM;
    }
    if ((flags & TEXT_HAS_COLOR) !== 0) {
      const red = reader.readUint8();
      const green = reader.readUint8();
      const blue = reader.readUint8();
      const alpha = version >= 2 ? reader.readUint8() : 0xff;
      color = ((red << 24) | (green << 16) | (blue << 8) | alpha) >>> 0;
    }
    if ((flags & TEXT_HAS_X_OFFSET) !== 0) x = readSwfTextOffset(reader);
    if ((flags & TEXT_HAS_Y_OFFSET) !== 0) y = readSwfTextOffset(reader);
    if ((flags & TEXT_HAS_FONT) !== 0) height = reader.readUint16();
    const glyphCount = reader.readUint8();
    if (!reader.valid) return null;

    // The outline source restores the font's design-unit grid. Record height is also authored in twips,
    // so appendSwfGlyphOutline applies the common twips-to-pixels conversion after scaling the design EM.
    const scale = unitsPerEm === 0 ? 0 : height / unitsPerEm;
    for (let i = 0; i < glyphCount; i++) {
      const index = reader.readUnsignedBits(glyphBits);
      const advance = reader.readSignedBits(advanceBits);
      if (!reader.valid) return null;
      if (font !== null && scale > 0) {
        if (font.getGlyphOutline(glyphOutline, index)) {
          appendSwfGlyphOutline(shape, glyphOutline, color, scale, x / TWIPS_PER_PIXEL, y / TWIPS_PER_PIXEL);
        }
      }
      x += advance;
    }
    reader.alignToByte();
  }
  return null;
}

// Reads an embedded font into the index-keyed outline seam shared with non-SWF font parsers. Glyph
// geometry is recovered through the same SHAPE decoder DefineText uses; DefineFont2/3 code and layout
// tables add Unicode lookup, advances, and vertical metrics. DefineFont1 has no code or layout table in
// its own tag, so this tag-level source derives advances/metrics from ink; the file decoder composes a
// separate DefineFontInfo tag over it when one exists.
export function readSwfFontGlyphOutlineSource(
  reader: SwfReader,
  version: number,
  diagnostics?: ImportDiagnostic[],
  characterId = 0,
): GlyphOutlineSource | null {
  const glyphReader = new SwfReader(reader.source, reader.pos, reader.end);
  const glyphs = readSwfFontGlyphs(glyphReader, version);
  if (glyphs === null) return null;

  const outlines = glyphs.map(createSwfGlyphOutlinePath);
  // A glyph whose outline does not decode costs that glyph rather than the font, so the font still
  // imports and every other glyph still draws. Drop rather than Recover: nothing is substituted for it,
  // and a text record addressing that index gets nothing.
  const lostGlyphs = outlines.reduce((count, outline) => (outline === null ? count + 1 : count), 0);
  if (lostGlyphs > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.font-glyph-outline',
      'readSwfFontGlyphOutlineSource',
      {
        capability: version === 1 ? 'swf.font.define-font' : `swf.font.define-font-${version}`,
        characterId,
        glyphCount: outlines.length,
        lostGlyphs,
      },
    );
  }
  const fallback = deriveSwfGlyphOutlineData(outlines, resolveSwfFontUnitsPerEm(version));
  const metadata = version === 1 ? null : readSwfFontMetadata(reader, version, outlines.length);
  const advances = metadata?.advances ?? fallback.advances;
  const codepointToGlyphIndex = metadata?.codepointToGlyphIndex ?? new Map<number, number>();
  const metrics = metadata?.metrics ?? fallback.metrics;

  return {
    getGlyphOutline(out, glyphIndex): boolean {
      out.commands.length = 0;
      out.data.length = 0;
      out.winding = 'nonZero';
      const outline = outlines[glyphIndex] ?? null;
      if (outline === null) return false;
      for (const command of outline.commands) out.commands.push(command);
      for (const value of outline.data) out.data.push(value);
      out.winding = outline.winding;
      return true;
    },
    getGlyphOutlineAdvance(glyphIndex): number {
      return advances[glyphIndex] ?? 0;
    },
    getGlyphOutlineIndexForCodePoint(codePoint): number {
      return codepointToGlyphIndex.get(codePoint) ?? -1;
    },
    getGlyphOutlineMetrics() {
      return metrics;
    },
  };
}

// Decodes a font's glyph outlines. An embedded SWF font is exactly that — a table of path outlines, one
// per glyph, in the font's own EM grid — so they cross into Flight as geometry and nothing here consults a
// text stack. The result is indexed by glyph index, which is what a static text record addresses; a null
// entry is a glyph whose outline did not decode, so one bad glyph costs that glyph rather than the font.
//
// This shape-only helper intentionally stops before the code and layout tables because static text stores
// indices directly. `readSwfFontGlyphOutlineSource` composes those tables over the same decoded geometry.
export function readSwfFontGlyphs(reader: SwfReader, version: number): (Shape | null)[] | null {
  reader.readUint16();
  if (version === 1) {
    // A version 1 font declares no glyph count and no code table: its offsets are measured from the table
    // that follows the id, the first of them is the table's own byte length, and the last glyph runs to the
    // end of the tag.
    const tableStart = reader.pos;
    return readSwfFontGlyphShapes(reader, readSwfLegacyFontOffsets(reader, tableStart), tableStart);
  }

  const flags = reader.readUint8();
  const hasWideOffsets = (flags & FONT_FLAG_WIDE_OFFSETS) !== 0;
  reader.readUint8();
  const nameLength = reader.readUint8();
  for (let i = 0; i < nameLength; i++) reader.readUint8();
  const glyphCount = reader.readUint16();
  if (!reader.valid || glyphCount > MAX_FONT_GLYPHS) return null;

  // Offsets are measured from the start of the offset table, and the table is followed by the code-table
  // offset, which doubles as the end of the last glyph.
  const tableStart = reader.pos;
  return readSwfFontGlyphShapes(reader, readSwfFontOffsets(reader, glyphCount, hasWideOffsets), tableStart);
}

// Re-emits one glyph's outline into a text's command stream, scaled, positioned, and recoloured. The
// glyph's own fill is dropped: a font stores shape, and the text record that uses it stores colour.
function appendSwfGlyphOutline(
  target: Shape,
  glyph: Readonly<Path>,
  color: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  appendShapeBeginFill(target, color, 1);
  let dataIndex = 0;
  for (const command of glyph.commands) {
    if (command === PathCommand.MOVE_TO) {
      appendShapeMoveTo(
        target,
        (glyph.data[dataIndex] * scale) / TWIPS_PER_PIXEL + offsetX,
        (glyph.data[dataIndex + 1] * scale) / TWIPS_PER_PIXEL + offsetY,
      );
      dataIndex += 2;
    } else if (command === PathCommand.LINE_TO) {
      appendShapeLineTo(
        target,
        (glyph.data[dataIndex] * scale) / TWIPS_PER_PIXEL + offsetX,
        (glyph.data[dataIndex + 1] * scale) / TWIPS_PER_PIXEL + offsetY,
      );
      dataIndex += 2;
    } else if (command === PathCommand.CURVE_TO) {
      appendShapeCurveTo(
        target,
        (glyph.data[dataIndex] * scale) / TWIPS_PER_PIXEL + offsetX,
        (glyph.data[dataIndex + 1] * scale) / TWIPS_PER_PIXEL + offsetY,
        (glyph.data[dataIndex + 2] * scale) / TWIPS_PER_PIXEL + offsetX,
        (glyph.data[dataIndex + 3] * scale) / TWIPS_PER_PIXEL + offsetY,
      );
      dataIndex += 4;
    }
  }
  appendShapeEndFill(target);
}

function createSwfGlyphOutlinePath(glyph: Readonly<Shape> | null): Path | null {
  if (glyph === null) return null;
  const regions = getShapeFillRegions(glyph.data.commands);
  if (regions === null) return null;
  const outline = createPath('nonZero');
  for (const region of regions) {
    const restored = createPath(region.path.winding);
    transformPath(region.path, FONT_SHAPE_TO_DESIGN_UNITS, restored);
    for (const command of restored.commands) outline.commands.push(command);
    for (const value of restored.data) outline.data.push(value);
  }
  return outline;
}

function deriveSwfGlyphOutlineData(outlines: readonly (Readonly<Path> | null)[], unitsPerEm: number) {
  const advances: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const outline of outlines) {
    const bounds: RectangleLike = { height: 0, width: 0, x: 0, y: 0 };
    if (outline === null || !getPathBounds(outline, bounds)) {
      advances.push(0);
      continue;
    }
    advances.push(Math.max(0, bounds.x + bounds.width));
    minY = Math.min(minY, bounds.y);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  const hasVerticalInk = minY !== Infinity;
  return {
    advances,
    metrics: {
      ascent: hasVerticalInk ? Math.max(0, -minY) : unitsPerEm * DEFAULT_ASCENT_RATIO,
      descent: hasVerticalInk ? Math.max(0, maxY) : unitsPerEm * (1 - DEFAULT_ASCENT_RATIO),
      lineGap: 0,
      unitsPerEm,
    },
  };
}

function readSwfFontMetadata(reader: SwfReader, version: number, expectedGlyphCount: number) {
  reader.readUint16();
  const flags = reader.readUint8();
  const hasLayout = (flags & FONT_FLAG_HAS_LAYOUT) !== 0;
  const hasWideCodes = (flags & FONT_FLAG_WIDE_CODES) !== 0;
  const hasWideOffsets = (flags & FONT_FLAG_WIDE_OFFSETS) !== 0;
  reader.readUint8();
  const nameLength = reader.readUint8();
  for (let i = 0; i < nameLength; i++) reader.readUint8();
  const glyphCount = reader.readUint16();
  if (!reader.valid || glyphCount !== expectedGlyphCount) return null;

  const tableStart = reader.pos;
  const offsets = readSwfFontOffsets(reader, glyphCount, hasWideOffsets);
  if (offsets === null) return null;
  const codeTableStart = tableStart + offsets[offsets.length - 1];
  if (codeTableStart < reader.pos || codeTableStart > reader.end) return null;
  reader.pos = codeTableStart;
  const codepointToGlyphIndex = new Map<number, number>();
  for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex++) {
    const codePoint = hasWideCodes ? reader.readUint16() : reader.readUint8();
    if (reader.valid && !codepointToGlyphIndex.has(codePoint)) codepointToGlyphIndex.set(codePoint, glyphIndex);
  }
  if (!reader.valid) return null;

  if (!hasLayout) return { advances: null, codepointToGlyphIndex, metrics: null };
  const unitsPerEm = resolveSwfFontUnitsPerEm(version);
  const metrics = {
    ascent: readSwfSignedUint16(reader),
    descent: readSwfSignedUint16(reader),
    lineGap: readSwfSignedUint16(reader),
    unitsPerEm,
  };
  const advances: number[] = [];
  for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex++) advances.push(readSwfSignedUint16(reader));
  for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex++) skipSwfRectangle(reader);
  const kerningCount = reader.readUint16();
  for (let index = 0; index < kerningCount; index++) {
    if (hasWideCodes) {
      reader.readUint16();
      reader.readUint16();
    } else {
      reader.readUint8();
      reader.readUint8();
    }
    reader.readUint16();
  }
  return reader.valid ? { advances, codepointToGlyphIndex, metrics } : null;
}

function readSwfSignedUint16(reader: SwfReader): number {
  const value = reader.readUint16();
  return value >= 0x8000 ? value - 0x10000 : value;
}

function skipSwfRectangle(reader: SwfReader): void {
  const bits = reader.readUnsignedBits(5);
  for (let index = 0; index < 4; index++) reader.readSignedBits(bits);
  reader.alignToByte();
}

function readSwfFontGlyphShapes(
  reader: SwfReader,
  offsets: readonly number[] | null,
  tableStart: number,
): (Shape | null)[] | null {
  if (offsets === null || offsets.length < 2) return offsets === null ? null : [];
  const glyphs: (Shape | null)[] = [];
  for (let i = 0; i + 1 < offsets.length; i++) {
    const start = tableStart + offsets[i];
    const end = tableStart + offsets[i + 1];
    if (start < tableStart || end > reader.end || end < start) return null;
    glyphs.push(createSwfGlyphShape(new SwfReader(reader.source, start, end)));
  }
  return glyphs;
}

// The offset table, plus the code-table offset that doubles as the end of the last glyph.
function readSwfFontOffsets(reader: SwfReader, glyphCount: number, hasWideOffsets: boolean): number[] | null {
  const offsets: number[] = [];
  for (let i = 0; i <= glyphCount; i++) offsets.push(hasWideOffsets ? reader.readUint32() : reader.readUint16());
  return reader.valid ? offsets : null;
}

// The version 1 form, whose glyph count is implied by the first offset — the table's own byte length.
function readSwfLegacyFontOffsets(reader: SwfReader, tableStart: number): number[] | null {
  const first = reader.readUint16();
  if (!reader.valid || first < 2 || first % 2 !== 0 || first / 2 > MAX_FONT_GLYPHS) return null;
  const offsets = [first];
  for (let i = 1; i < first / 2; i++) offsets.push(reader.readUint16());
  offsets.push(reader.end - tableStart);
  return reader.valid ? offsets : null;
}

function readSwfTextOffset(reader: SwfReader): number {
  const value = reader.readUint16();
  return value >= 0x8000 ? value - 0x10000 : value;
}

// A version 3 font stores its glyphs on a grid twenty times finer than a version 1 or 2 font, so the same
// outline scales differently for the same text height.
export function resolveSwfFontUnitsPerEm(version: number): number {
  return version === 3 ? DEFAULT_FONT_UNITS_PER_EM * TWIPS_PER_PIXEL : DEFAULT_FONT_UNITS_PER_EM;
}

const DEFAULT_FONT_UNITS_PER_EM = 1024;
const DEFAULT_ASCENT_RATIO = 0.8;
const FONT_FLAG_HAS_LAYOUT = 0x80;
const FONT_FLAG_WIDE_CODES = 0x04;
const FONT_FLAG_WIDE_OFFSETS = 0x08;
const FONT_SHAPE_TO_DESIGN_UNITS = { a: 20, b: 0, c: 0, d: 20, tx: 0, ty: 0 };
const MAX_FONT_GLYPHS = 0xffff;
const MAX_TEXT_RECORDS = 100_000;
const TEXT_HAS_COLOR = 0x04;
const TEXT_HAS_FONT = 0x08;
const TEXT_HAS_X_OFFSET = 0x01;
const TEXT_HAS_Y_OFFSET = 0x02;
const TEXT_RECORD_TYPE = 0x80;
const TWIPS_PER_PIXEL = 20;
