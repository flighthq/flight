import { createPath } from '@flighthq/path/contract';
import type { GlyphOutlineSource, Shape } from '@flighthq/types/contract';

import { SwfReader } from './swfReader';
import { ShapeWriter } from './swfShapeTestHelper';
import {
  createSwfTextShape,
  readSwfFontGlyphOutlineSource,
  readSwfFontGlyphs,
  resolveSwfFontUnitsPerEm,
} from './swfText';

describe('createSwfTextShape', () => {
  it('places a glyph outline at the record height and colour, then advances the pen', () => {
    const font = boxFont(512);
    const writer = new TextWriter();
    writer.writeRecord({ color: 0x00ff00, fontId: 1, height: 1024 });
    writer.writeGlyph(0, 600);
    writer.writeGlyph(0, 0);
    writer.end();

    const shape = createSwfTextShape(writer.toReader(), 1, new Map([[1, font]]));

    // Two glyphs, each its own fill span, the second offset by the first's 600-twip advance (30px).
    expect(shape?.data.commands.filter((token) => token === 'beginFill')).toHaveLength(2);
    expect(shape?.data.commands.slice(0, 8)).toEqual(['beginFill', 2, 0x00ff00ff, 1, 'moveTo', 2, 0, 0]);
    const secondMove = shape!.data.commands.indexOf('moveTo', 8);
    expect(shape?.data.commands.slice(secondMove, secondMove + 4)).toEqual(['moveTo', 2, 30, 0]);
  });

  it('scales a glyph by the record height over the font EM grid', () => {
    const writer = new TextWriter();
    // Half the EM height, so the 512-unit box halves to 256 units — 12.8px after twips conversion.
    writer.writeRecord({ color: 0, fontId: 1, height: 512 });
    writer.writeGlyph(0, 0);
    writer.end();

    const shape = createSwfTextShape(writer.toReader(), 1, new Map([[1, boxFont(512)]]));

    expect(shape?.data.commands.slice(4, 12)).toEqual(['moveTo', 2, 0, 0, 'lineTo', 2, 12.8, 0]);
  });

  it('draws a version 3 glyph at the size its version 1 twin draws, on the finer grid', () => {
    // The same square at the same record height, authored twice: 512 units on the 1024 grid a version 1
    // font uses, and 10240 units on the twenty-times-finer grid version 3 stores. Two encodings of one
    // picture is the oracle — a wrong EM square makes the version 3 form twenty times too large, which
    // is the same defect shape as a bitmap fill matrix left in twips.
    const writeText = (fontId: number): SwfReader => {
      const writer = new TextWriter();
      writer.writeRecord({ color: 0, fontId, height: 512 });
      writer.writeGlyph(0, 0);
      writer.end();
      return writer.toReader();
    };
    const fonts = new Map([
      [1, boxFont(512)],
      [3, boxFontVersion3(512 * 20)],
    ]);

    const legacy = createSwfTextShape(writeText(1), 1, fonts);
    const modern = createSwfTextShape(writeText(3), 1, fonts);

    expect(modern?.data.commands.slice(4, 12)).toEqual(['moveTo', 2, 0, 0, 'lineTo', 2, 12.8, 0]);
    expect(modern?.data.commands).toEqual(legacy?.data.commands);
  });

  it('skips a glyph index the font does not carry rather than failing the text', () => {
    const writer = new TextWriter();
    writer.writeRecord({ color: 0, fontId: 1, height: 1024 });
    writer.writeGlyph(9, 0);
    writer.end();

    const shape = createSwfTextShape(writer.toReader(), 1, new Map([[1, boxFont(512)]]));

    expect(shape).not.toBeNull();
    expect(shape?.data.commands).toEqual([]);
  });

  it('preserves DefineText2 alpha in the packed RGBA fill color', () => {
    const font = boxFont(512);
    const writer = new TextWriter();
    writer.writeRecord({ alpha: 0x80, color: 0x00ff00, fontId: 1, height: 1024 });
    writer.writeGlyph(0, 0);
    writer.end();

    const shape = createSwfTextShape(writer.toReader(), 2, new Map([[1, font]]));

    expect(shape?.data.commands[2]).toBe(0x00ff0080);
  });

  it('returns null for a record stream that runs out', () => {
    const writer = new TextWriter();
    writer.writeRecord({ color: 0, fontId: 1, height: 1024 });
    const bytes = writer.toBytes();

    expect(createSwfTextShape(new SwfReader(bytes, 0, bytes.length - 1), 1, new Map())).toBeNull();
  });
});

describe('readSwfFontGlyphOutlineSource', () => {
  it('recovers DefineFont2 codepoint lookup, layout metrics, advances, and raw design-unit paths', () => {
    const glyph = boxGlyphBytes(256);
    const offsets = joinBytes(uint16(4), uint16(4 + glyph.length));
    const bytes = joinBytes(
      uint16(7),
      new Uint8Array([FONT_HAS_LAYOUT, 0, 0]),
      uint16(1),
      offsets,
      glyph,
      new Uint8Array([0x41]),
      uint16(800),
      uint16(200),
      uint16(50),
      uint16(600),
      ZERO_RECTANGLE,
      uint16(0),
    );

    const source = readSwfFontGlyphOutlineSource(new SwfReader(bytes, 0, bytes.length), 2)!;
    const outline = createPath();

    expect(source.getGlyphOutlineIndexForCodePoint(0x41)).toBe(0);
    expect(source.getGlyphOutlineIndexForCodePoint(0x42)).toBe(-1);
    expect(source.getGlyphOutlineAdvance(0)).toBe(600);
    expect(source.getGlyphOutlineMetrics()).toEqual({ ascent: 800, descent: 200, lineGap: 50, unitsPerEm: 1024 });
    expect(source.getGlyphOutline(outline, 0)).toBe(true);
    expect(outline.data).toContain(256);
  });

  it('keeps a legacy DefineFont index-addressable without inventing a codepoint map', () => {
    const source = boxFont(512);

    expect(source.getGlyphOutlineIndexForCodePoint(0x41)).toBe(-1);
    expect(source.getGlyphOutlineAdvance(0)).toBe(512);
  });
});

describe('readSwfFontGlyphs', () => {
  it('reads a version 1 font whose glyph count comes from its own offset table', () => {
    const glyph = boxGlyphBytes(512);
    const bytes = joinBytes(uint16(4), uint16(2), glyph);

    const glyphs = readSwfFontGlyphs(new SwfReader(bytes, 0, bytes.length), 1);

    expect(glyphs).toHaveLength(1);
    expect(glyphs![0]?.data.commands.slice(0, 4)).toEqual(['beginFill', 2, 0x000000ff, 1]);
  });

  it('reads a version 2 font through its declared glyph count and code-table offset', () => {
    const glyph = boxGlyphBytes(256);
    // id, flags, language, name length, glyph count, offset table + code table offset, glyphs.
    // Offsets run from the start of the table, which is two entries — four bytes — before the glyph.
    const offsets = joinBytes(uint16(4), uint16(4 + glyph.length));
    const bytes = joinBytes(uint16(7), new Uint8Array([0, 0, 0]), uint16(1), offsets, glyph);

    const glyphs = readSwfFontGlyphs(new SwfReader(bytes, 0, bytes.length), 2);

    expect(glyphs).toHaveLength(1);
    expect(glyphs![0]?.data.commands.slice(0, 4)).toEqual(['beginFill', 2, 0x000000ff, 1]);
  });

  it('returns null for a font whose offset table runs past its tag', () => {
    const bytes = joinBytes(uint16(4), uint16(0x7fff));

    expect(readSwfFontGlyphs(new SwfReader(bytes, 0, bytes.length), 1)).toBeNull();
  });
});

describe('resolveSwfFontUnitsPerEm', () => {
  it('reports the finer grid a version 3 font stores its glyphs on', () => {
    expect(resolveSwfFontUnitsPerEm(1)).toBe(1024);
    expect(resolveSwfFontUnitsPerEm(2)).toBe(1024);
    // A version 3 font multiplies its glyph coordinates by twenty, so the same outline needs twenty
    // times the EM units to render at one height.
    expect(resolveSwfFontUnitsPerEm(3)).toBe(20480);
  });
});

// A square glyph of `size` EM units, as the bare SHAPE a font stores.
function boxGlyphBytes(size: number): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeStyleBits(1, 0);
  writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
  writer.writeStraightEdge(size, 0);
  writer.writeStraightEdge(0, size);
  writer.writeStraightEdge(-size, 0);
  writer.writeStraightEdge(0, -size);
  writer.writeEndShape();
  return writer.toBytes();
}

function boxFont(size: number): GlyphOutlineSource {
  const bytes = boxGlyphBytes(size);
  return readSwfFontGlyphOutlineSource(new SwfReader(joinBytes(uint16(1), uint16(2), bytes), 0, bytes.length + 4), 1)!;
}

// The same square through the version 2/3 tag layout: id, flags, language, name length, glyph count,
// the offset table and its trailing code-table offset, then the glyph.
function boxFontVersion3(size: number): GlyphOutlineSource {
  const glyph = boxGlyphBytes(size);
  const bytes = joinBytes(
    uint16(3),
    new Uint8Array([0, 0, 0]),
    uint16(1),
    uint16(4),
    uint16(4 + glyph.length),
    glyph,
    new Uint8Array([0x41]),
  );
  return readSwfFontGlyphOutlineSource(new SwfReader(bytes, 0, bytes.length), 3)!;
}

class TextWriter {
  private readonly bytes: number[] = [];
  private bits: number[] = [];

  end(): void {
    this.flush();
    this.bytes.push(0);
  }

  toBytes(): Uint8Array {
    this.flush();
    // Glyph bits and advance bits lead the record stream.
    return new Uint8Array([4, 16, ...this.bytes]);
  }

  toReader(): SwfReader {
    const bytes = this.toBytes();
    return new SwfReader(bytes, 0, bytes.length);
  }

  writeGlyph(index: number, advance: number): void {
    for (let i = 3; i >= 0; i--) this.bits.push((index >> i) & 1);
    const value = advance < 0 ? advance + 0x10000 : advance;
    for (let i = 15; i >= 0; i--) this.bits.push((value >> i) & 1);
  }

  writeRecord(record: Readonly<{ alpha?: number; color: number; fontId: number; height: number }>): void {
    this.flush();
    this.bytes.push(0x80 | 0x08 | 0x04);
    this.bytes.push(record.fontId & 0xff, (record.fontId >> 8) & 0xff);
    this.bytes.push((record.color >> 16) & 0xff, (record.color >> 8) & 0xff, record.color & 0xff);
    if (record.alpha !== undefined) this.bytes.push(record.alpha);
    this.bytes.push(record.height & 0xff, (record.height >> 8) & 0xff);
    // Glyph count is patched by the caller's writeGlyph calls, so it is written as a placeholder the
    // helper fills when the record closes; here the tests always write exactly what they declare.
    this.bytes.push(0);
    this.glyphCountIndex = this.bytes.length - 1;
  }

  private glyphCountIndex = -1;

  private flush(): void {
    if (this.bits.length === 0) return;
    while (this.bits.length % 8 !== 0) this.bits.push(0);
    const glyphs = this.bits.length / 20;
    if (this.glyphCountIndex >= 0) this.bytes[this.glyphCountIndex] = glyphs;
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | this.bits[i + b];
      this.bytes.push(byte);
    }
    this.bits = [];
  }
}

function joinBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

const FONT_HAS_LAYOUT = 0x80;
const ZERO_RECTANGLE = new Uint8Array([0x08, 0x00]);
