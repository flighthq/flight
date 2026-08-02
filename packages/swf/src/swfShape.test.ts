import { SwfReader } from './swfReader';
import { createSwfShape } from './swfShape';
import { ShapeWriter } from './swfShapeTestHelper';

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
      0xff0000,
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
      0x0000ff,
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
      0x00ff00,
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
      0xffffff,
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

    expect(shape?.data.commands[2]).toBe(0x112233);
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
      0x102030,
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
    expect(shape?.data.commands[3]).toEqual([0xff0000, 0x0000ff]);
    expect(shape?.data.commands[4]).toEqual([1, 1]);
    expect(shape?.data.commands[5]).toEqual([0, 255]);
    expect(shape?.data.commands[6]).toMatchObject({ a: 1, b: 0, c: 0, d: 1, tx: 20, ty: 40 });
    expect(shape?.data.commands[7]).toBe('pad');
  });

  it('keeps a bitmap fill unpainted rather than guessing at its pixels', () => {
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

    const shape = createSwfShape(writer.toReader(), 1);

    expect(shape?.data.commands).toEqual([]);
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
