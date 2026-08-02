import { SwfReader } from './swfReader';

describe('SwfReader', () => {
  it('reads little-endian integers and reports an overrun instead of throwing', () => {
    const reader = new SwfReader(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]), 0, 6);
    expect(reader.readUint8()).toBe(0x01);
    expect(reader.readUint16()).toBe(0x0302);
    expect(reader.valid).toBe(true);

    // Only three bytes remain, so the fourth reads as zero. A partial value is still composed — `valid`,
    // not the value, is what tells a caller the read ran off the end.
    reader.readUint32();
    expect(reader.valid).toBe(false);
    expect(reader.readUint8()).toBe(0);
  });

  it('reads big-endian bit fields across byte boundaries and signs them', () => {
    // 1011 0100 1111 0000: a 3-bit 5, a 5-bit signed -6, then an 8-bit 240.
    const reader = new SwfReader(new Uint8Array([0b10110100, 0b11110000]), 0, 2);
    expect(reader.readUnsignedBits(3)).toBe(0b101);
    expect(reader.readSignedBits(5)).toBe(-12);
    expect(reader.readUnsignedBits(8)).toBe(0b11110000);
    expect(reader.valid).toBe(true);
  });

  it('treats a zero-width bit field as zero without consuming input', () => {
    const reader = new SwfReader(new Uint8Array([0xff]), 0, 1);
    expect(reader.readSignedBits(0)).toBe(0);
    expect(reader.readUint8()).toBe(0xff);
  });

  it('aligns to the next byte before a byte-oriented read', () => {
    const reader = new SwfReader(new Uint8Array([0b10000000, 0x42]), 0, 2);
    expect(reader.readUnsignedBits(1)).toBe(1);
    expect(reader.readUint8()).toBe(0x42);
  });

  it('reads a null-terminated string and fails on one that never terminates', () => {
    const bytes = new Uint8Array([0x68, 0x69, 0x00, 0x6e, 0x6f]);
    const reader = new SwfReader(bytes, 0, bytes.length);
    expect(reader.readString()).toBe('hi');
    expect(reader.readString()).toBe('');
    expect(reader.valid).toBe(false);
  });

  it('reads multi-byte encoded unsigned integers and signed 8.8 fixed values', () => {
    const reader = new SwfReader(new Uint8Array([0x7f, 0xc8, 0x01, 0x80, 0xff]), 0, 5);
    expect(reader.readEncodedUint32()).toBe(127);
    expect(reader.readEncodedUint32()).toBe(200);
    expect(reader.readFixed8()).toBe(-0.5);
  });
});
