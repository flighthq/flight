export type { ByteReader } from '@flighthq/types/contract';

import type { ByteReader, NonEntityCreateResult } from '@flighthq/types/contract';

export function createByteReader(
  bytes: Readonly<Uint8Array>,
  offset = 0,
): NonEntityCreateResult<ByteReader, 'descriptor'> {
  return { view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset };
}

export function hasByteReaderBytes(reader: Readonly<ByteReader>, count: number): boolean {
  return count >= 0 && reader.offset + count <= reader.view.byteLength;
}

export function readByteReaderU16(reader: ByteReader): number {
  const value = reader.view.getUint16(reader.offset, true);
  reader.offset += 2;
  return value;
}

export function readByteReaderU24(reader: ByteReader): number {
  const view = reader.view;
  const offset = reader.offset;
  const value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
  reader.offset += 3;
  return value;
}

export function readByteReaderU24BigEndian(reader: ByteReader): number {
  const view = reader.view;
  const offset = reader.offset;
  const value = (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2);
  reader.offset += 3;
  return value;
}

export function readByteReaderU32(reader: ByteReader): number {
  const value = reader.view.getUint32(reader.offset, true);
  reader.offset += 4;
  return value;
}

export function readByteReaderU32BigEndian(reader: ByteReader): number {
  const value = reader.view.getUint32(reader.offset, false);
  reader.offset += 4;
  return value;
}

export function readByteReaderU64(reader: ByteReader): number {
  const low = reader.view.getUint32(reader.offset, true);
  const high = reader.view.getUint32(reader.offset + 4, true);
  reader.offset += 8;
  return high * 0x1_0000_0000 + low;
}

export function readByteReaderU8(reader: ByteReader): number {
  const value = reader.view.getUint8(reader.offset);
  reader.offset += 1;
  return value;
}

export function skipByteReader(reader: ByteReader, count: number): void {
  reader.offset += count;
}
