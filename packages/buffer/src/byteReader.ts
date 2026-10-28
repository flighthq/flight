// Generated from crates/flight-buffer/src/byte_reader.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { NonEntityCreateResult } from '@flighthq/entity/contract';

/**
 * A forward-only little/big-endian cursor over a byte view (TS `ByteReader`), shared by the
 * binary format parsers.
 */
export interface ByteReader {
  view: Readonly<Uint8Array>;
  offset: number;
}

export function createByteReader(
  bytes: Readonly<Uint8Array>,
  offset?: number,
): NonEntityCreateResult<ByteReader, 'descriptor'> {
  return { view: bytes, offset: offset ?? 0 };
}

export function hasByteReaderBytes(reader: Readonly<ByteReader>, count: number): boolean {
  return reader.offset <= reader.view.length && count <= reader.view.length - reader.offset;
}

export function readByteReaderU16(reader: ByteReader): number {
  const offset = reader.offset;
  const value = reader.view[offset] | (reader.view[offset + 1] << 8);
  reader.offset += 2;
  return value;
}

export function readByteReaderU24(reader: ByteReader): number {
  const offset = reader.offset;
  const value =
    (reader.view[offset] >>> 0) | ((reader.view[offset + 1] >>> 0) << 8) | ((reader.view[offset + 2] >>> 0) << 16);
  reader.offset += 3;
  return value >>> 0;
}

export function readByteReaderU24BigEndian(reader: ByteReader): number {
  const offset = reader.offset;
  const value =
    ((reader.view[offset] >>> 0) << 16) | ((reader.view[offset + 1] >>> 0) << 8) | (reader.view[offset + 2] >>> 0);
  reader.offset += 3;
  return value >>> 0;
}

export function readByteReaderU32(reader: ByteReader): number {
  const offset = reader.offset;
  const value = readByteReaderU32At(reader.view, offset);
  reader.offset += 4;
  return value >>> 0;
}

function readByteReaderU32At(view: Readonly<Uint8Array>, offset: number): number {
  return (
    ((view[offset] >>> 0) |
      ((view[offset + 1] >>> 0) << 8) |
      ((view[offset + 2] >>> 0) << 16) |
      ((view[offset + 3] >>> 0) << 24)) >>>
    0
  );
}

export function readByteReaderU32BigEndian(reader: ByteReader): number {
  const offset = reader.offset;
  const value =
    ((reader.view[offset] >>> 0) << 24) |
    ((reader.view[offset + 1] >>> 0) << 16) |
    ((reader.view[offset + 2] >>> 0) << 8) |
    (reader.view[offset + 3] >>> 0);
  reader.offset += 4;
  return value >>> 0;
}

export function readByteReaderU64(reader: ByteReader): number {
  const offset = reader.offset;
  const low = readByteReaderU32At(reader.view, offset);
  const high = readByteReaderU32At(reader.view, offset + 4);
  const value = high * 0x1_0000_0000 + low;
  reader.offset += 8;
  return value;
}

export function readByteReaderU8(reader: ByteReader): number {
  const value = reader.view[reader.offset];
  reader.offset += 1;
  return value;
}

export function skipByteReader(reader: ByteReader, count: number): void {
  reader.offset += count;
}
