import { createTexture } from '@flighthq/texture/contract';
import type { ImportDiagnostic } from '@flighthq/types/contract';

import { SwfReader } from './swfReader';
import { createSwfGlyphShape, createSwfShape, readSwfMorphShapePaths } from './swfShape';
import { ShapeWriter } from './swfShapeTestHelper';

describe('createSwfGlyphShape', () => {
  it('decodes a bare SHAPE that carries no style array of its own', () => {
    const writer = new ShapeWriter();
    // No fill or line style arrays — a glyph starts straight at the style bits, and its edges reference
    // an implicit fill whose colour belongs to the text record that draws it.
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(1024, 0);
    writer.writeStraightEdge(0, 1024);
    writer.writeEndShape();

    const glyph = createSwfGlyphShape(writer.toReader());

    expect(glyph?.data.commands.slice(0, 4)).toEqual(['beginFill', 2, 0x000000ff, 1]);
    expect(glyph?.data.commands.slice(4, 12)).toEqual(['moveTo', 2, 0, 0, 'lineTo', 2, 51.2, 0]);
  });

  it('returns null for a glyph whose records run out', () => {
    const writer = new ShapeWriter();
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    const bytes = writer.toBytes();

    expect(createSwfGlyphShape(new SwfReader(bytes, 0, bytes.length - 1))).toBeNull();
  });
});

describe('createSwfShape', () => {
  it('decodes a solid-filled rectangle into one closed contour', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0xff0000]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeStraightEdge(0, 1000);
    writer.writeStraightEdge(-2000, 0);
    writer.writeStraightEdge(0, -1000);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 1);

    expect(shape?.data.commands).toEqual([
      'beginFill',
      2,
      0xff0000ff,
      1,
      'moveTo',
      2,
      0,
      0,
      'lineTo',
      2,
      100,
      0,
      'lineTo',
      2,
      100,
      50,
      'lineTo',
      2,
      0,
      50,
      'lineTo',
      2,
      0,
      0,
      'endFill',
      0,
    ]);
  });

  it('converts twips to pixels and keeps a curved edge quadratic', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0x0000ff]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 20, moveToY: 40 });
    writer.writeCurvedEdge(200, 0, 200, 100);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 1);

    // Control and anchor are absolute after the deltas accumulate: (20+200, 40+0) then (220+200, 40+100).
    expect(shape?.data.commands).toEqual([
      'beginFill',
      2,
      0x0000ffff,
      1,
      'moveTo',
      2,
      1,
      2,
      'curveTo',
      4,
      11,
      2,
      21,
      7,
      'endFill',
      0,
    ]);
  });

  it('reverses the edges of a right-hand fill so both sides wind the same way', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0x00ff00]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    // The same two edges, declared as the fill's right-hand side rather than its left.
    writer.writeStyleChange({ fill0: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeStraightEdge(0, 1000);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 1);

    // Read back from the far end: (100,50) to (100,0) to (0,0).
    expect(shape?.data.commands).toEqual([
      'beginFill',
      2,
      0x00ff00ff,
      1,
      'moveTo',
      2,
      100,
      50,
      'lineTo',
      2,
      100,
      0,
      'lineTo',
      2,
      0,
      0,
      'endFill',
      0,
    ]);
  });

  it('stitches separately declared runs into one contour', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0xffffff]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    // Two halves of one triangle, declared out of order and broken by a move.
    writer.writeStyleChange({ fill1: 1, moveToX: 2000, moveToY: 0 });
    writer.writeStraightEdge(-2000, 1000);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 1000 });
    writer.writeStraightEdge(0, -1000);
    writer.writeStraightEdge(2000, 0);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 1);

    // One moveTo, not two: the run starting at (0,50) continues the run that ended there.
    expect(shape?.data.commands.filter((token) => token === 'moveTo')).toHaveLength(1);
    expect(shape?.data.commands).toEqual([
      'beginFill',
      2,
      0xffffffff,
      1,
      'moveTo',
      2,
      100,
      0,
      'lineTo',
      2,
      0,
      50,
      'lineTo',
      2,
      0,
      0,
      'lineTo',
      2,
      100,
      0,
      'endFill',
      0,
    ]);
  });

  it('reads per-record alpha from a Shape 3 definition', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(1);
    writer.writeByte(0x00);
    writer.writeByte(0x11);
    writer.writeByte(0x22);
    writer.writeByte(0x33);
    writer.writeByte(0xff);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(100, 0);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 3);

    expect(shape?.data.commands[2]).toBe(0x112233ff);
    expect(shape?.data.commands[3]).toBe(1);
  });

  it('emits a stroke with its width in pixels and no fill', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(0);
    writer.writeLineStyleCount(1);
    writer.writeUint16(40);
    writer.writeByte(0x10);
    writer.writeByte(0x20);
    writer.writeByte(0x30);
    writer.writeStyleBits(0, 1);
    writer.writeStyleChange({ line: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 1);

    expect(shape?.data.commands).toEqual([
      'lineStyle',
      8,
      2,
      0x102030ff,
      1,
      false,
      'normal',
      'round',
      'round',
      3,
      'moveTo',
      2,
      0,
      0,
      'lineTo',
      2,
      100,
      0,
    ]);
  });

  it('passes a linear gradient through with its ratios and converted matrix', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(1);
    writer.writeByte(0x10);
    writer.writeIdentityMatrix(400, 800);
    writer.writeGradient([
      { color: 0xff0000, ratio: 0 },
      { color: 0x0000ff, ratio: 255 },
    ]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 1);

    expect(shape?.data.commands[0]).toBe('beginGradientFill');
    expect(shape?.data.commands[2]).toBe('linear');
    expect(shape?.data.commands[3]).toEqual([0xff0000ff, 0x0000ffff]);
    expect(shape?.data.commands[4]).toEqual([1, 1]);
    expect(shape?.data.commands[5]).toEqual([0, 255]);
    expect(shape?.data.commands[6]).toMatchObject({ a: 1, b: 0, c: 0, d: 1, tx: 20, ty: 40 });
    expect(shape?.data.commands[7]).toBe('pad');
  });

  // The fill matrix is file data, so a collapsed one is a plain thing to encounter. Validated where it
  // enters rather than at the renderer, which would otherwise invert it into a defined-but-wrong matrix
  // (a/b/c/d zeroed, tx/ty negated) and paint wrong pixels with nothing raised and nothing to grep for.
  it('drops a singular bitmap fill matrix and names the character, keeping the fill', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(1);
    writer.writeByte(0x41);
    writer.writeUint16(7);
    writer.writeZeroScaleMatrix();
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeEndShape();

    const diagnostics: ImportDiagnostic[] = [];
    const shape = createSwfShape(writer.toReader(), 1, () => createTexture(), diagnostics);

    const matches = diagnostics.filter((d) => d.kind === 'swf.fill-matrix-singular');
    expect(matches).toHaveLength(1);
    expect(matches[0].severity).toBe('Recover');
    expect(matches[0].detail).toMatchObject({ character: 7 });
    // Recovered, not rejected: the fill is still emitted, just untransformed.
    expect(shape?.data.commands[0]).toBe('beginTextureFill');
    expect(shape?.data.commands[3]).toBeNull();
  });

  it('keeps an invertible bitmap fill matrix and reports nothing', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(1);
    writer.writeByte(0x41);
    writer.writeUint16(7);
    writer.writeIdentityMatrix(0, 0);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeEndShape();

    const diagnostics: ImportDiagnostic[] = [];
    const shape = createSwfShape(writer.toReader(), 1, () => createTexture(), diagnostics);

    expect(diagnostics.filter((d) => d.kind === 'swf.fill-matrix-singular')).toHaveLength(0);
    expect(shape?.data.commands[3]).not.toBeNull();
  });

  it('emits geometry for a bitmap fill, with a texture its pixels arrive into later', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(1);
    writer.writeByte(0x41);
    writer.writeUint16(7);
    writer.writeIdentityMatrix(0, 0);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeEndShape();

    const seen: number[] = [];
    const texture = createTexture();
    const shape = createSwfShape(writer.toReader(), 1, (characterId) => {
      seen.push(characterId);
      return texture;
    });

    // Dropping the geometry would lose the artwork's shape as well as its paint, which is the whole
    // picture for a file whose art is bitmap-filled.
    expect(shape?.data.commands[0]).toBe('beginTextureFill');
    expect(shape?.data.commands.filter((token) => token === 'lineTo')).toHaveLength(1);
    // The fill names the character whose pixels belong in it, and the texture starts sourceless.
    expect(seen).toEqual([7]);
    expect(shape?.data.commands[2]).toBe(texture);
    expect(texture.source).toBeNull();
  });

  it('converts a bitmap fill matrix from image pixels to shape pixels', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(1);
    // Scale 20 is the twips-per-pixel identity, so the matrix reaches the command stream as 1:1.
    writer.writeBitmapFillStyle(0x41, 7, 20);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeStraightEdge(0, 1000);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 3, () => createTexture());

    expect(shape?.data.commands[3]).toMatchObject({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  });

  it('hands the decoder the two sampling flags its fill type encodes', () => {
    const seen: Array<readonly [number, boolean, boolean]> = [];
    for (const type of [0x40, 0x41, 0x42, 0x43]) {
      const writer = new ShapeWriter();
      writer.writeFillStyleCount(1);
      writer.writeBitmapFillStyle(type, 3, 20);
      writer.writeLineStyleCount(0);
      writer.writeStyleBits(1, 0);
      writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
      writer.writeStraightEdge(100, 0);
      writer.writeEndShape();
      createSwfShape(writer.toReader(), 3, (characterId, repeat, smoothed) => {
        seen.push([characterId, repeat, smoothed]);
        return createTexture();
      });
    }

    // Repeat and smoothing are sampler axes, so one character can back all four combinations at once.
    expect(seen).toEqual([
      [3, true, true],
      [3, false, true],
      [3, true, false],
      [3, false, false],
    ]);
  });

  it('keeps the contour but paints nothing when the resolver declines the character', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(1);
    writer.writeBitmapFillStyle(0x41, 99, 20);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    writer.writeStraightEdge(2000, 0);
    writer.writeStraightEdge(0, 1000);
    writer.writeEndShape();

    const shape = createSwfShape(writer.toReader(), 3, () => null);

    expect(shape?.data.commands[0]).toBe('beginFill');
    expect(shape?.data.commands.filter((token) => token === 'lineTo')).toHaveLength(2);
  });

  it('returns null for a body that runs out mid-record', () => {
    const writer = new ShapeWriter();
    writer.writeSolidFillStyles([0xff0000]);
    writer.writeLineStyleCount(0);
    writer.writeStyleBits(1, 0);
    writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 });
    const bytes = writer.toBytes();

    expect(createSwfShape(new SwfReader(bytes, 0, bytes.length - 1), 1)).toBeNull();
  });

  it('returns null for an unknown fill style type', () => {
    const writer = new ShapeWriter();
    writer.writeFillStyleCount(1);
    writer.writeByte(0x99);
    writer.writeEndShape();

    expect(createSwfShape(writer.toReader(), 1)).toBeNull();
  });
});

describe('readSwfMorphShapePaths', () => {
  it('keys both endpoints by the style index the start edges referenced, in pixels', () => {
    const paths = readSwfMorphShapePaths(morphReader(200), morphReader(400))!;

    expect([...paths.fills.keys()]).toEqual([1]);
    // 200 twips is 10 pixels: the decode converts, so both endpoints are already comparable.
    expect(paths.fills.get(1)!.start.data.slice(0, 4)).toEqual([0, 0, 10, 0]);
    expect(paths.fills.get(1)!.end.data.slice(0, 4)).toEqual([0, 0, 20, 0]);
  });

  it('gives the two endpoints identical structure, so nothing has to match them up afterwards', () => {
    const paths = readSwfMorphShapePaths(morphReader(200), morphReader(400))!;

    const pair = paths.fills.get(1)!;
    expect(pair.end.commands).toEqual(pair.start.commands);
    expect(pair.end.data).toHaveLength(pair.start.data.length);
  });

  it('pairs the edges when only the end set changes style, which positional matching cannot', () => {
    // The start set names its style once; the end set adds a style change the start does not have. The
    // walk consumes it on the end cursor alone rather than falling out of step — the case that left one
    // corpus morph undecoded when each endpoint was read on its own.
    const start = new ShapeWriter();
    start.writeStyleBits(2, 2);
    start.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 }, 2);
    start.writeStraightEdge(200, 0);
    start.writeStraightEdge(0, 200);
    start.writeEndShape();
    const end = new ShapeWriter();
    end.writeStyleBits(2, 2);
    end.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 }, 2);
    end.writeStraightEdge(400, 0);
    end.writeStyleChange({ moveToX: 400, moveToY: 0 }, 2);
    end.writeStraightEdge(0, 400);
    end.writeEndShape();
    const startBytes = start.toBytes();
    const endBytes = end.toBytes();

    const paths = readSwfMorphShapePaths(
      new SwfReader(startBytes, 0, startBytes.length),
      new SwfReader(endBytes, 0, endBytes.length),
    )!;

    expect([...paths.fills.keys()]).toEqual([1]);
    expect(paths.fills.get(1)!.end.commands).toEqual(paths.fills.get(1)!.start.commands);
  });

  it('rejects an endpoint that introduces styles, which a morph never does', () => {
    const writer = new ShapeWriter();
    writer.writeStyleBits(1, 1);
    writer.writeNewStylesRecord();
    const bytes = writer.toBytes();

    expect(readSwfMorphShapePaths(new SwfReader(bytes, 0, bytes.length), morphReader(200))).toBeNull();
  });
});

// One closed box `width` twips across under fill style 1, as a morph endpoint's bare SHAPE.
function morphReader(width: number): SwfReader {
  const writer = new ShapeWriter();
  writer.writeStyleBits(2, 2);
  writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 }, 2);
  writer.writeStraightEdge(width, 0);
  writer.writeStraightEdge(0, width);
  writer.writeStraightEdge(-width, 0);
  writer.writeStraightEdge(0, -width);
  writer.writeEndShape();
  const bytes = writer.toBytes();
  return new SwfReader(bytes, 0, bytes.length);
}
