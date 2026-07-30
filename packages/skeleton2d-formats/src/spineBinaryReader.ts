import type { ByteReader } from '@flighthq/types/contract';

// The wire primitives of Spine's `.skel` binary skeleton — the byte layer beneath `parseSpineSkeleton`'s
// JSON. Spine writes the file with a Java `DataOutputStream`, so fixed-width numbers are BIG-ENDIAN, and it
// writes counts, indices, and string lengths as Kryo-style variable-length integers (7 payload bits per
// byte, high bit = "another byte follows", at most 5 bytes). Two integer flavors share that encoding: an
// unsigned one for counts and indices, and a zigzag-folded signed one for values that can go negative.
//
// These functions are the format's DECODING RULES ONLY — they carry no knowledge of Spine's record layout
// (which field follows which), so they are verifiable on their own terms: a varint byte sequence has one
// correct value independent of where Spine happens to use it. The layout above them is the part that needs
// a real `.skel` to confirm; this part does not.
//
// TRUNCATION IS A SENTINEL, NOT A THROW. Third-party bytes are untrusted and a truncated file must not
// raise a `DataView` RangeError from deep inside a parse. A read that cannot be satisfied consumes nothing,
// returns a neutral value (0 / false / null), and parks the cursor PAST the end as a sticky overrun mark —
// so every later read is also short-circuited and the caller can bail out once per record via
// `isSpineBinaryReaderOverrun` instead of guarding every single field. The mark is deliberately
// `byteLength + 1`: a cursor resting exactly ON `byteLength` is the legitimate end-of-stream state after
// reading the final byte, and must not read as an error.
export function createSpineBinaryReader(bytes: Readonly<Uint8Array>): ByteReader {
  return { offset: 0, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
}

// Whether `count` more bytes remain. False once the cursor is overrun, so a guarded read stays guarded.
export function hasSpineBinaryBytes(reader: Readonly<ByteReader>, count: number): boolean {
  return count >= 0 && reader.offset + count <= reader.view.byteLength;
}

// Whether a read has run past the end of the buffer. Sticky: once set, it stays set, so a parser can walk a
// whole record and test once at the end rather than after every field.
export function isSpineBinaryReaderOverrun(reader: Readonly<ByteReader>): boolean {
  return reader.offset > reader.view.byteLength;
}

// A Spine boolean: one byte, zero = false.
export function readSpineBinaryBoolean(reader: ByteReader): boolean {
  return readSpineBinaryByte(reader) !== 0;
}

// One unsigned byte.
export function readSpineBinaryByte(reader: ByteReader): number {
  if (!hasSpineBinaryBytes(reader, 1)) return markSpineBinaryOverrun(reader, 0);
  return reader.view.getUint8(reader.offset++);
}

// A big-endian 32-bit float.
export function readSpineBinaryFloat(reader: ByteReader): number {
  if (!hasSpineBinaryBytes(reader, 4)) return markSpineBinaryOverrun(reader, 0);
  const value = reader.view.getFloat32(reader.offset, false);
  reader.offset += 4;
  return value;
}

// A big-endian fixed-width signed 32-bit integer — Spine's `readInt()` without the varint packing (it uses
// this for packed RGBA colors, where all four bytes are always present).
export function readSpineBinaryInt(reader: ByteReader): number {
  if (!hasSpineBinaryBytes(reader, 4)) return markSpineBinaryOverrun(reader, 0);
  const value = reader.view.getInt32(reader.offset, false);
  reader.offset += 4;
  return value;
}

// A SIGNED variable-length integer: the same 7-bits-per-byte encoding, zigzag-folded so a small negative
// costs one byte instead of five (−1 → 1, 1 → 2, −2 → 3, …). Spine's `readInt(false)`.
export function readSpineBinarySignedVarint(reader: ByteReader): number {
  const raw = readSpineBinaryRawVarint(reader);
  return (raw >>> 1) ^ -(raw & 1);
}

// A length-prefixed UTF-8 string. The prefix is a varint BYTE COUNT PLUS ONE, which is what lets Spine
// distinguish the two empty cases it needs: 0 means "no string at all" (a genuinely absent field → the
// `null` sentinel), 1 means "a string of zero bytes" (present but empty). Any larger value carries
// `count − 1` bytes of UTF-8.
export function readSpineBinaryString(reader: ByteReader): string | null {
  const byteCount = readSpineBinaryVarint(reader);
  if (byteCount === 0) return null;
  if (byteCount === 1) return '';
  const length = byteCount - 1;
  if (!hasSpineBinaryBytes(reader, length)) return markSpineBinaryOverrun(reader, null);
  const start = reader.view.byteOffset + reader.offset;
  const bytes = new Uint8Array(reader.view.buffer, start, length);
  reader.offset += length;
  return _decoder.decode(bytes);
}

// A big-endian 16-bit value — Spine's `readShort()`, which it uses for mesh triangle indices. Java writes it
// signed, but an index is never negative, so reading it unsigned is equivalent over the real value range and
// matches `MeshAttachment2D.triangles`' `Uint16Array` without a sign-conversion step.
export function readSpineBinaryUnsignedShort(reader: ByteReader): number {
  if (!hasSpineBinaryBytes(reader, 2)) return markSpineBinaryOverrun(reader, 0);
  const value = reader.view.getUint16(reader.offset, false);
  reader.offset += 2;
  return value;
}

// An UNSIGNED variable-length integer — Spine's `readInt(true)`, used for counts, indices, and string
// lengths. Returned unsigned so a value with bit 31 set reads as a large count rather than a negative one.
export function readSpineBinaryVarint(reader: ByteReader): number {
  return readSpineBinaryRawVarint(reader) >>> 0;
}

// Advances past `count` bytes (a field the importer does not model), marking overrun if they are not there.
export function skipSpineBinaryBytes(reader: ByteReader, count: number): void {
  if (!hasSpineBinaryBytes(reader, count)) {
    markSpineBinaryOverrun(reader, 0);
    return;
  }
  reader.offset += count;
}

// Parks the cursor past the end so every later read short-circuits, and hands back the caller's neutral
// value. Returning it through here keeps each read function a single expression at its call site.
function markSpineBinaryOverrun<T>(reader: ByteReader, value: T): T {
  reader.offset = reader.view.byteLength + 1;
  return value;
}

// The shared varint core, returning the raw 32-bit pattern before either flavor interprets it. Up to five
// bytes carry 7 payload bits each (the fifth contributing the top 4 bits of a 32-bit value); the high bit of
// each byte says whether another follows. A truncated sequence stops early through the overrun mark, which
// yields 0 from the missing bytes rather than reading past the buffer.
function readSpineBinaryRawVarint(reader: ByteReader): number {
  let b = readSpineBinaryByte(reader);
  let result = b & 0x7f;
  if ((b & 0x80) !== 0) {
    b = readSpineBinaryByte(reader);
    result |= (b & 0x7f) << 7;
    if ((b & 0x80) !== 0) {
      b = readSpineBinaryByte(reader);
      result |= (b & 0x7f) << 14;
      if ((b & 0x80) !== 0) {
        b = readSpineBinaryByte(reader);
        result |= (b & 0x7f) << 21;
        if ((b & 0x80) !== 0) result |= (readSpineBinaryByte(reader) & 0x7f) << 28;
      }
    }
  }
  return result;
}

// One shared UTF-8 decoder: allocating a TextDecoder per string would put an allocation in the per-record
// path of a format whose every name is a string.
const _decoder = new TextDecoder();
