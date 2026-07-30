import { describe, expect, it } from 'vitest';

import {
  createSpineBinaryReader,
  hasSpineBinaryBytes,
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryByte,
  readSpineBinaryFloat,
  readSpineBinaryInt,
  readSpineBinarySignedVarint,
  readSpineBinaryString,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader';

describe('createSpineBinaryReader', () => {
  it('starts at the beginning and is not overrun', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([1, 2, 3]));
    expect(reader.offset).toBe(0);
    expect(isSpineBinaryReaderOverrun(reader)).toBe(false);
  });

  it('reads only the window of a subarray, not the whole backing buffer', () => {
    // A caller who slices one file out of a larger buffer must not be able to read its neighbours.
    const backing = Uint8Array.from([0xaa, 0xbb, 0x07, 0xcc]);
    const reader = createSpineBinaryReader(backing.subarray(2, 3));
    expect(reader.view.byteLength).toBe(1);
    expect(readSpineBinaryByte(reader)).toBe(0x07);
    // The neighbouring 0xcc is outside the window, so the next read overruns rather than leaking it.
    expect(readSpineBinaryByte(reader)).toBe(0);
    expect(isSpineBinaryReaderOverrun(reader)).toBe(true);
  });
});

describe('hasSpineBinaryBytes', () => {
  it('reports the bytes remaining and stays false once overrun', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([1, 2]));
    expect(hasSpineBinaryBytes(reader, 2)).toBe(true);
    expect(hasSpineBinaryBytes(reader, 3)).toBe(false);
    readSpineBinaryByte(reader);
    expect(hasSpineBinaryBytes(reader, 1)).toBe(true);
    expect(hasSpineBinaryBytes(reader, 2)).toBe(false);
    readSpineBinaryFloat(reader); // overruns
    expect(hasSpineBinaryBytes(reader, 0)).toBe(false);
  });
});

describe('isSpineBinaryReaderOverrun', () => {
  it('treats a cursor resting exactly at the end as a clean end-of-stream', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([1]));
    readSpineBinaryByte(reader);
    expect(reader.offset).toBe(1);
    expect(isSpineBinaryReaderOverrun(reader)).toBe(false);
  });

  it('is STICKY — one short read short-circuits every later read', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0x41]));
    expect(readSpineBinaryFloat(reader)).toBe(0); // needs 4, has 1
    expect(isSpineBinaryReaderOverrun(reader)).toBe(true);
    // The unread 0x41 is NOT handed out afterwards: the mark short-circuits everything downstream.
    expect(readSpineBinaryByte(reader)).toBe(0);
    expect(readSpineBinaryString(reader)).toBeNull();
    expect(readSpineBinaryBoolean(reader)).toBe(false);
    expect(isSpineBinaryReaderOverrun(reader)).toBe(true);
  });

  it('does not consume the bytes a short read could not satisfy', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([1, 2, 3]));
    readSpineBinaryFloat(reader); // needs 4, has 3
    expect(isSpineBinaryReaderOverrun(reader)).toBe(true);
    expect(reader.offset).toBeGreaterThan(reader.view.byteLength);
  });
});

describe('readSpineBinaryBoolean', () => {
  it('reads one byte, zero false and any nonzero true', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0, 1, 0xff]));
    expect(readSpineBinaryBoolean(reader)).toBe(false);
    expect(readSpineBinaryBoolean(reader)).toBe(true);
    expect(readSpineBinaryBoolean(reader)).toBe(true);
  });
});

describe('readSpineBinaryByte', () => {
  it('reads unsigned bytes in order', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0x00, 0x7f, 0x80, 0xff]));
    expect(readSpineBinaryByte(reader)).toBe(0x00);
    expect(readSpineBinaryByte(reader)).toBe(0x7f);
    expect(readSpineBinaryByte(reader)).toBe(0x80);
    expect(readSpineBinaryByte(reader)).toBe(0xff);
  });
});

describe('readSpineBinaryFloat', () => {
  it('reads BIG-endian 32-bit floats', () => {
    // 1.0 is 0x3f800000 and −2.5 is 0xc0200000; byte-swapped input would read as garbage, which is the
    // point of asserting the byte order explicitly.
    const reader = createSpineBinaryReader(Uint8Array.from([0x3f, 0x80, 0x00, 0x00, 0xc0, 0x20, 0x00, 0x00]));
    expect(readSpineBinaryFloat(reader)).toBe(1);
    expect(readSpineBinaryFloat(reader)).toBe(-2.5);
  });
});

describe('readSpineBinaryInt', () => {
  it('reads BIG-endian signed 32-bit integers', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0x00, 0x00, 0x01, 0x00, 0xff, 0xff, 0xff, 0xff]));
    expect(readSpineBinaryInt(reader)).toBe(256);
    expect(readSpineBinaryInt(reader)).toBe(-1);
  });
});

describe('readSpineBinarySignedVarint', () => {
  it('undoes the zigzag fold so small negatives cost one byte', () => {
    // Raw varints 0,1,2,3,4 fold back to 0,−1,1,−2,2.
    const reader = createSpineBinaryReader(Uint8Array.from([0, 1, 2, 3, 4]));
    expect(readSpineBinarySignedVarint(reader)).toBe(0);
    expect(readSpineBinarySignedVarint(reader)).toBe(-1);
    expect(readSpineBinarySignedVarint(reader)).toBe(1);
    expect(readSpineBinarySignedVarint(reader)).toBe(-2);
    expect(readSpineBinarySignedVarint(reader)).toBe(2);
  });

  it('folds the widest five-byte pattern to the most negative int32', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x0f]));
    expect(readSpineBinarySignedVarint(reader)).toBe(-2147483648);
  });
});

describe('readSpineBinaryString', () => {
  it('distinguishes an ABSENT string from an empty one by the 0/1 length prefix', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0x00, 0x01]));
    expect(readSpineBinaryString(reader)).toBeNull(); // 0 = no string at all
    expect(readSpineBinaryString(reader)).toBe(''); // 1 = present but empty
  });

  it('reads `count − 1` bytes of UTF-8, including multi-byte code points', () => {
    // 'abc' is 3 bytes so the prefix is 4; 'é' is the two bytes c3 a9 so its prefix is 3.
    const reader = createSpineBinaryReader(Uint8Array.from([0x04, 0x61, 0x62, 0x63, 0x03, 0xc3, 0xa9]));
    expect(readSpineBinaryString(reader)).toBe('abc');
    expect(readSpineBinaryString(reader)).toBe('é');
    expect(isSpineBinaryReaderOverrun(reader)).toBe(false);
  });

  it('reads a string out of a subarray window without leaking past it', () => {
    const backing = Uint8Array.from([0xaa, 0x03, 0x68, 0x69, 0xbb]);
    const reader = createSpineBinaryReader(backing.subarray(1, 4));
    expect(readSpineBinaryString(reader)).toBe('hi');
  });

  it('returns the null sentinel when the declared length runs past the end', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0x09, 0x61, 0x62]));
    expect(readSpineBinaryString(reader)).toBeNull();
    expect(isSpineBinaryReaderOverrun(reader)).toBe(true);
  });
});

describe('readSpineBinaryVarint', () => {
  it('reads the 7-bits-per-byte encoding across every byte-count boundary', () => {
    const reader = createSpineBinaryReader(
      Uint8Array.from([
        0x00, // 0
        0x7f, // 127 — the largest one-byte value
        0x80,
        0x01, // 128 — the smallest two-byte value
        0xff,
        0x7f, // 16383 — the largest two-byte value
        0x80,
        0x80,
        0x01, // 16384
      ]),
    );
    expect(readSpineBinaryVarint(reader)).toBe(0);
    expect(readSpineBinaryVarint(reader)).toBe(127);
    expect(readSpineBinaryVarint(reader)).toBe(128);
    expect(readSpineBinaryVarint(reader)).toBe(16383);
    expect(readSpineBinaryVarint(reader)).toBe(16384);
  });

  it('returns the widest five-byte pattern UNSIGNED rather than as a negative int32', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x0f]));
    expect(readSpineBinaryVarint(reader)).toBe(4294967295);
  });

  it('stops at the buffer end instead of reading past it when a continuation byte is missing', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([0x80])); // says "more follows", but nothing does
    expect(readSpineBinaryVarint(reader)).toBe(0);
    expect(isSpineBinaryReaderOverrun(reader)).toBe(true);
  });
});

describe('skipSpineBinaryBytes', () => {
  it('advances past unmodelled fields', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([1, 2, 3, 4]));
    skipSpineBinaryBytes(reader, 3);
    expect(readSpineBinaryByte(reader)).toBe(4);
  });

  it('marks overrun rather than skipping past the end', () => {
    const reader = createSpineBinaryReader(Uint8Array.from([1, 2]));
    skipSpineBinaryBytes(reader, 5);
    expect(isSpineBinaryReaderOverrun(reader)).toBe(true);
  });
});
