import { describe, expect, it } from 'vitest';

import {
  createByteReader,
  hasByteReaderBytes,
  readByteReaderU16,
  readByteReaderU24BigEndian,
  readByteReaderU32,
  readByteReaderU64,
  readByteReaderU8,
  skipByteReader,
} from './byteReader';

describe('createByteReader', () => {
  it('starts at the given offset', () => {
    const reader = createByteReader(new Uint8Array([1, 2, 3, 4]), 2);
    expect(reader.offset).toBe(2);
    expect(readByteReaderU8(reader)).toBe(3);
  });

  it('views a subarray by its byteOffset', () => {
    const backing = new Uint8Array([9, 9, 0x01, 0x00]);
    const reader = createByteReader(backing.subarray(2));
    expect(readByteReaderU16(reader)).toBe(1);
  });
});

describe('hasByteReaderBytes', () => {
  it('reports whether count bytes remain from the current offset', () => {
    const reader = createByteReader(new Uint8Array(8), 4);
    expect(hasByteReaderBytes(reader, 4)).toBe(true);
    expect(hasByteReaderBytes(reader, 5)).toBe(false);
    expect(hasByteReaderBytes(reader, 0)).toBe(true);
  });
});

describe('readByteReaderU16', () => {
  it('reads little-endian and advances 2', () => {
    const reader = createByteReader(new Uint8Array([0x34, 0x12]));
    expect(readByteReaderU16(reader)).toBe(0x1234);
    expect(reader.offset).toBe(2);
  });
});

describe('readByteReaderU24BigEndian', () => {
  it('reads a 3-byte big-endian value and advances 3', () => {
    const reader = createByteReader(new Uint8Array([0x12, 0x34, 0x56]));
    expect(readByteReaderU24BigEndian(reader)).toBe(0x123456);
    expect(reader.offset).toBe(3);
  });

  it('reads the full 24-bit range without sign issues', () => {
    const reader = createByteReader(new Uint8Array([0xff, 0xff, 0xff]));
    expect(readByteReaderU24BigEndian(reader)).toBe(0xffffff);
  });
});

describe('readByteReaderU32', () => {
  it('reads little-endian and advances 4', () => {
    const reader = createByteReader(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
    expect(readByteReaderU32(reader)).toBe(0x12345678);
    expect(reader.offset).toBe(4);
  });
});

describe('readByteReaderU64', () => {
  it('reads little-endian as a number and advances 8', () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setUint32(0, 0x1000, true);
    new DataView(bytes.buffer).setUint32(4, 0x2, true);
    const reader = createByteReader(bytes);
    expect(readByteReaderU64(reader)).toBe(0x2 * 0x1_0000_0000 + 0x1000);
    expect(reader.offset).toBe(8);
  });
});

describe('readByteReaderU8', () => {
  it('reads one byte and advances 1', () => {
    const reader = createByteReader(new Uint8Array([0xab]));
    expect(readByteReaderU8(reader)).toBe(0xab);
    expect(reader.offset).toBe(1);
  });
});

describe('skipByteReader', () => {
  it('advances the offset without reading', () => {
    const reader = createByteReader(new Uint8Array(8));
    skipByteReader(reader, 3);
    expect(reader.offset).toBe(3);
  });
});
