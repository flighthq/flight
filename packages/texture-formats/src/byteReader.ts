// A minimal little-endian cursor over a byte buffer, shared by all three container parsers. KTX2, DDS,
// and the Basis container are all little-endian, so every multi-byte header field is read through this.
// The cursor is a plain `{ view, offset }` value with an advancing `offset`; read functions advance it,
// and every parser guards a read against `hasByteReaderBytes` first so a truncated file returns a
// sentinel `null` rather than throwing a `DataView` `RangeError`. `readByteReaderU64` returns the value
// as a JavaScript number, exact for the sub-2^53 offsets/lengths real containers use.

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

export function readByteReaderU32(reader: ByteReader): number {
  const value = reader.view.getUint32(reader.offset, true);
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
