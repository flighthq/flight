// A minimal cursor over a byte buffer, shared by every container parser. KTX2, DDS, and the Basis
// container are little-endian (the `read*U16`/`U32`/`U64` helpers); ATF stores its block and header
// lengths big-endian, so `readByteReaderU24BigEndian` reads a legacy ATF's 3-byte block-length prefix
// and `readByteReaderU32BigEndian` reads a versioned ATF's 4-byte block/header lengths. The cursor
// is a plain `{ view, offset }` value with an advancing `offset`; read functions advance it, and every
// parser guards a read against `hasByteReaderBytes` first so a truncated file returns a sentinel `null`
// rather than throwing a `DataView` `RangeError`. `readByteReaderU64` returns the value as a JavaScript
// number, exact for the sub-2^53 offsets/lengths real containers use.

export interface ByteReader {
  readonly view: DataView;
  offset: number;
}

export function createByteReader(bytes: Readonly<Uint8Array>, offset = 0): ByteReader {
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
