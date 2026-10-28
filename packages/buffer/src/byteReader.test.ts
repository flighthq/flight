// Generated from crates/flight-buffer/tests/byte_reader_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  createByteReader,
  hasByteReaderBytes,
  readByteReaderU16,
  readByteReaderU24,
  readByteReaderU24BigEndian,
  readByteReaderU32,
  readByteReaderU32BigEndian,
  readByteReaderU64,
  readByteReaderU8,
  skipByteReader,
} from './contract.ts';

describe('createByteReader', () => {
  it('starts at the given offset', () => {
    const bytes: Uint8Array = new Uint8Array([1, 2, 3, 4]);
    let reader = createByteReader(bytes, 2);
    expect(reader.offset).toEqual(2);
    expect(readByteReaderU8(reader)).toEqual(3);
  });
  it('views a subslice at its own start', () => {
    const backing: Uint8Array = new Uint8Array([9, 9, 0x01, 0x00]);
    let reader = createByteReader(backing.slice(2), undefined);
    expect(readByteReaderU16(reader)).toEqual(1);
  });
});

describe('hasByteReaderBytes', () => {
  // Rust-only: rejects a count that would overflow native pointer arithmetic
  it('reports whether count bytes remain from the current offset', () => {
    const bytes = new Uint8Array(8).fill(0);
    const reader = createByteReader(bytes, 4);
    expect(hasByteReaderBytes(reader, 4)).toBe(true);
    expect(!hasByteReaderBytes(reader, 5)).toBe(true);
    expect(hasByteReaderBytes(reader, 0)).toBe(true);
  });
});

describe('readByteReaderU16', () => {
  it('reads little endian and advances two', () => {
    const bytes: Uint8Array = new Uint8Array([0x34, 0x12]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU16(reader)).toEqual(0x1234);
    expect(reader.offset).toEqual(2);
  });
});

describe('readByteReaderU24', () => {
  it('reads a three byte little endian value and advances three', () => {
    const bytes: Uint8Array = new Uint8Array([0x56, 0x34, 0x12]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU24(reader)).toEqual(0x123456);
    expect(reader.offset).toEqual(3);
  });
  it('reads the full unsigned range', () => {
    const bytes: Uint8Array = new Uint8Array([0xff, 0xff, 0xff]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU24(reader)).toEqual(0xff_ffff);
  });
});

describe('readByteReaderU24BigEndian', () => {
  it('reads a three byte big endian value and advances three', () => {
    const bytes: Uint8Array = new Uint8Array([0x12, 0x34, 0x56]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU24BigEndian(reader)).toEqual(0x123456);
    expect(reader.offset).toEqual(3);
  });
  it('reads the full unsigned range', () => {
    const bytes: Uint8Array = new Uint8Array([0xff, 0xff, 0xff]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU24BigEndian(reader)).toEqual(0xff_ffff);
  });
});

describe('readByteReaderU32', () => {
  it('reads little endian and advances four', () => {
    const bytes: Uint8Array = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU32(reader)).toEqual(0x1234_5678);
    expect(reader.offset).toEqual(4);
  });
});

describe('readByteReaderU32BigEndian', () => {
  it('reads big endian and advances four', () => {
    const bytes: Uint8Array = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU32BigEndian(reader)).toEqual(0x1234_5678);
    expect(reader.offset).toEqual(4);
  });
  it('reads the full unsigned range', () => {
    const bytes: Uint8Array = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU32BigEndian(reader)).toEqual(0xffffffff);
  });
});

describe('readByteReaderU64', () => {
  it('reads little endian exactly and advances eight', () => {
    const bytes: Uint8Array = new Uint8Array([0, 0x10, 0, 0, 2, 0, 0, 0]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU64(reader)).toEqual(2 * 0x1_0000_0000 + 0x1000);
    expect(reader.offset).toEqual(8);
  });
  it('reads the low word as unsigned when combining the result', () => {
    const bytes: Uint8Array = new Uint8Array([0xff, 0xff, 0xff, 0xff, 2, 0, 0, 0]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU64(reader)).toEqual(3 * 0x1_0000_0000 - 1);
  });
});

describe('readByteReaderU8', () => {
  it('reads one byte and advances one', () => {
    const bytes: Uint8Array = new Uint8Array([0xab]);
    let reader = createByteReader(bytes, undefined);
    expect(readByteReaderU8(reader)).toEqual(0xab);
    expect(reader.offset).toEqual(1);
  });
});

describe('skipByteReader', () => {
  it('advances the offset without reading', () => {
    const bytes = new Uint8Array(8).fill(0);
    let reader = createByteReader(bytes, undefined);
    skipByteReader(reader, 3);
    expect(reader.offset).toEqual(3);
  });
});
