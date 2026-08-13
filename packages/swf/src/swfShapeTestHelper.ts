import { SwfReader } from './swfReader';

// Writes the bit-level SHAPEWITHSTYLE encoding the decoder reads. Byte-oriented fields flush the pending
// bits first, mirroring the format's own alignment rule.
export class ShapeWriter {
  private readonly bits: number[] = [];

  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let i = 0; i < this.bits.length; i++) {
      bytes[Math.floor(i / 8)] |= this.bits[i] << (7 - (i % 8));
    }
    return bytes;
  }

  toReader(): SwfReader {
    const bytes = this.toBytes();
    return new SwfReader(bytes, 0, bytes.length);
  }

  writeByte(value: number): void {
    this.align();
    this.writeUnsigned(value, 8);
  }

  writeCurvedEdge(controlX: number, controlY: number, anchorX: number, anchorY: number): void {
    const bits = signedBitCount([controlX, controlY, anchorX, anchorY]);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(bits - 2, 4);
    this.writeSigned(controlX, bits);
    this.writeSigned(controlY, bits);
    this.writeSigned(anchorX, bits);
    this.writeSigned(anchorY, bits);
  }

  writeEndShape(): void {
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 5);
    this.align();
  }

  writeFillStyleCount(count: number): void {
    this.writeByte(count);
  }

  writeGradient(records: ReadonlyArray<{ color: number; ratio: number }>): void {
    this.align();
    this.writeUnsigned(0, 2);
    this.writeUnsigned(0, 2);
    this.writeUnsigned(records.length, 4);
    for (const record of records) {
      this.writeByte(record.ratio);
      this.writeByte((record.color >> 16) & 0xff);
      this.writeByte((record.color >> 8) & 0xff);
      this.writeByte(record.color & 0xff);
    }
  }

  // One FILLSTYLE for a bitmap fill: the type byte, the little-endian character id, and a matrix carrying
  // `scale` in both axes. SWF writes shape space in twips, so a 1:1 bitmap fill authors scale 20.
  writeBitmapFillStyle(type: number, characterId: number, scale: number): void {
    this.writeByte(type);
    this.writeByte(characterId & 0xff);
    this.writeByte((characterId >> 8) & 0xff);
    this.writeScaleMatrix(scale);
  }

  writeScaleMatrix(scale: number): void {
    this.align();
    const value = Math.round(scale * 65536);
    const scaleBits = signedBitCount([value]);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(scaleBits, 5);
    this.writeSigned(value, scaleBits);
    this.writeSigned(value, scaleBits);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 5);
    this.align();
  }

  writeIdentityMatrix(translateX: number, translateY: number): void {
    this.align();
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 1);
    const bits = signedBitCount([translateX, translateY]);
    this.writeUnsigned(bits, 5);
    this.writeSigned(translateX, bits);
    this.writeSigned(translateY, bits);
    this.align();
  }

  // A MATRIX whose scale field is present and ZERO — what an authoring tool writes for a collapsed fill.
  // `writeIdentityMatrix` cannot express this: it clears the has-scale bit, which MEANS scale 1.
  writeZeroScaleMatrix(): void {
    this.align();
    this.writeUnsigned(1, 1);
    this.writeUnsigned(1, 5);
    this.writeSigned(0, 1);
    this.writeSigned(0, 1);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(1, 5);
    this.writeSigned(0, 1);
    this.writeSigned(0, 1);
    this.align();
  }

  writeLineStyleCount(count: number): void {
    this.writeByte(count);
  }

  writeSolidFillStyles(colors: ReadonlyArray<number>): void {
    this.writeFillStyleCount(colors.length);
    for (const color of colors) {
      this.writeByte(0x00);
      this.writeByte((color >> 16) & 0xff);
      this.writeByte((color >> 8) & 0xff);
      this.writeByte(color & 0xff);
    }
  }

  writeStraightEdge(deltaX: number, deltaY: number): void {
    const bits = signedBitCount([deltaX, deltaY]);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(bits - 2, 4);
    this.writeUnsigned(1, 1);
    this.writeSigned(deltaX, bits);
    this.writeSigned(deltaY, bits);
  }

  // The new-styles bit is the one style-change flag no helper writes, because only a shape that carries
  // its own styles can set it — which is exactly what a morph endpoint must be rejected for.
  writeNewStylesRecord(): void {
    this.writeUnsigned(0, 1);
    this.writeUnsigned(1, 1);
    this.writeUnsigned(0, 4);
  }

  writeStyleBits(fillBits: number, lineBits: number): void {
    this.align();
    this.writeUnsigned(fillBits, 4);
    this.writeUnsigned(lineBits, 4);
  }

  // `bits` is the style-index width declared by writeStyleBits; the default of one matches a shape with
  // at most one style per kind, which is what most fixtures build.
  writeStyleChange(
    change: Readonly<{ fill0?: number; fill1?: number; line?: number; moveToX?: number; moveToY?: number }>,
    bits = 1,
  ): void {
    const hasMove = change.moveToX !== undefined && change.moveToY !== undefined;
    this.writeUnsigned(0, 1);
    this.writeUnsigned(0, 1);
    this.writeUnsigned(change.line === undefined ? 0 : 1, 1);
    this.writeUnsigned(change.fill1 === undefined ? 0 : 1, 1);
    this.writeUnsigned(change.fill0 === undefined ? 0 : 1, 1);
    this.writeUnsigned(hasMove ? 1 : 0, 1);
    if (hasMove) {
      const bits = signedBitCount([change.moveToX!, change.moveToY!]);
      this.writeUnsigned(bits, 5);
      this.writeSigned(change.moveToX!, bits);
      this.writeSigned(change.moveToY!, bits);
    }
    if (change.fill0 !== undefined) this.writeUnsigned(change.fill0, bits);
    if (change.fill1 !== undefined) this.writeUnsigned(change.fill1, bits);
    if (change.line !== undefined) this.writeUnsigned(change.line, bits);
  }

  writeUint16(value: number): void {
    this.writeByte(value & 0xff);
    this.writeByte((value >> 8) & 0xff);
  }

  private align(): void {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
  }

  private writeSigned(value: number, count: number): void {
    this.writeUnsigned(value < 0 ? value + 2 ** count : value, count);
  }

  private writeUnsigned(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.bits.push(Math.floor(value / 2 ** i) & 1);
  }
}

function signedBitCount(values: ReadonlyArray<number>): number {
  for (let bits = 2; bits < 32; bits++) {
    const minimum = -(2 ** (bits - 1));
    const maximum = 2 ** (bits - 1) - 1;
    if (values.every((value) => value >= minimum && value <= maximum)) return bits;
  }
  return 32;
}
