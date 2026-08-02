import {
  appendShapeBeginFill,
  appendShapeCurveTo,
  appendShapeEndFill,
  appendShapeLineTo,
  appendShapeMoveTo,
  createShape,
} from '@flighthq/shape/contract';
import type { Shape, ShapeCommandToken } from '@flighthq/types/contract';

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
  glyphsByFont: ReadonlyMap<number, readonly (Shape | null)[]>,
  unitsPerEmByFont: ReadonlyMap<number, number>,
): Shape | null {
  const glyphBits = reader.readUint8();
  const advanceBits = reader.readUint8();
  if (!reader.valid) return null;

  const shape = createShape();
  let glyphs: readonly (Shape | null)[] | null = null;
  let unitsPerEm = DEFAULT_FONT_UNITS_PER_EM;
  let color = 0;
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
      glyphs = glyphsByFont.get(fontId) ?? null;
      unitsPerEm = unitsPerEmByFont.get(fontId) ?? DEFAULT_FONT_UNITS_PER_EM;
    }
    if ((flags & TEXT_HAS_COLOR) !== 0) {
      const red = reader.readUint8();
      const green = reader.readUint8();
      const blue = reader.readUint8();
      if (version >= 2) reader.readUint8();
      color = red * 0x10000 + green * 0x100 + blue;
    }
    if ((flags & TEXT_HAS_X_OFFSET) !== 0) x = readSwfTextOffset(reader);
    if ((flags & TEXT_HAS_Y_OFFSET) !== 0) y = readSwfTextOffset(reader);
    if ((flags & TEXT_HAS_FONT) !== 0) height = reader.readUint16();
    const glyphCount = reader.readUint8();
    if (!reader.valid) return null;

    // Glyph geometry arrives divided by the twips-per-pixel the shape decoder applies, so scaling by the
    // record height in twips over the font's EM units lands in pixels without a second conversion.
    const scale = unitsPerEm === 0 ? 0 : height / unitsPerEm;
    for (let i = 0; i < glyphCount; i++) {
      const index = reader.readUnsignedBits(glyphBits);
      const advance = reader.readSignedBits(advanceBits);
      if (!reader.valid) return null;
      const glyph = glyphs === null ? null : (glyphs[index] ?? null);
      if (glyph !== null && scale > 0) {
        appendSwfGlyphOutline(shape, glyph, color, scale, x / TWIPS_PER_PIXEL, y / TWIPS_PER_PIXEL);
      }
      x += advance;
    }
    reader.alignToByte();
  }
  return null;
}

// Decodes a font's glyph outlines. An embedded SWF font is exactly that — a table of path outlines, one
// per glyph, in the font's own EM grid — so they cross into Flight as geometry and nothing here consults a
// text stack. The result is indexed by glyph index, which is what a static text record addresses; a null
// entry is a glyph whose outline did not decode, so one bad glyph costs that glyph rather than the font.
//
// What is NOT read here is the code table that follows the glyphs, mapping character codes onto these
// indices. Static text needs no such mapping because it stores indices directly. An edit-text field does,
// because it stores a string — so the code table is where a future path-backed glyph source starts, and it
// sits immediately after the glyph shapes at the offset this reader already walks past.
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
  glyph: Readonly<Shape>,
  color: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): void {
  const commands = glyph.data.commands;
  appendShapeBeginFill(target, color, 1);
  let i = 0;
  while (i + 1 < commands.length) {
    const name = commands[i] as string;
    const count = commands[i + 1] as number;
    const a = i + 2;
    if (name === 'moveTo') {
      appendShapeMoveTo(target, at(commands, a) * scale + offsetX, at(commands, a + 1) * scale + offsetY);
    } else if (name === 'lineTo') {
      appendShapeLineTo(target, at(commands, a) * scale + offsetX, at(commands, a + 1) * scale + offsetY);
    } else if (name === 'curveTo') {
      appendShapeCurveTo(
        target,
        at(commands, a) * scale + offsetX,
        at(commands, a + 1) * scale + offsetY,
        at(commands, a + 2) * scale + offsetX,
        at(commands, a + 3) * scale + offsetY,
      );
    }
    i = a + count;
  }
  appendShapeEndFill(target);
}

function at(commands: readonly ShapeCommandToken[], index: number): number {
  return commands[index] as number;
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
const FONT_FLAG_WIDE_OFFSETS = 0x08;
const MAX_FONT_GLYPHS = 0xffff;
const MAX_TEXT_RECORDS = 100_000;
const TEXT_HAS_COLOR = 0x04;
const TEXT_HAS_FONT = 0x08;
const TEXT_HAS_X_OFFSET = 0x01;
const TEXT_HAS_Y_OFFSET = 0x02;
const TEXT_RECORD_TYPE = 0x80;
const TWIPS_PER_PIXEL = 20;
