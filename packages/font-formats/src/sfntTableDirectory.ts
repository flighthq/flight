import type { SfntTableDirectory } from '@flighthq/types/contract';

// The sfnt container's table directory: a fixed 12-byte header followed by one 16-byte record per
// table, each record naming a four-character tag and the table's byte range within the file. Every
// OpenType flavor shares this layout — what differs is only which tables are present — so this is the
// one reader every table parser starts from.
//
// Offsets and tags are facts about the format. Nothing here interprets a table's contents.

const SFNT_HEADER_BYTES = 12;
const SFNT_TABLE_RECORD_BYTES = 16;

// Reads the directory and clamps every entry to the bytes actually present. A record pointing past the
// end of the buffer is dropped rather than trusted or thrown on: a truncated download is an ordinary
// thing to be handed, and the caller distinguishes "table absent" from "file damaged" by comparing
// `declaredTableCount` against the size of `tables` — which is exactly what `explainOpenTypeFont`
// reports. Returns the null sentinel only when the header itself cannot be read.
export function readSfntTableDirectory(bytes: Readonly<Uint8Array>): SfntTableDirectory | null {
  if (bytes.byteLength < SFNT_HEADER_BYTES) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredTableCount = view.getUint16(4);
  const tables = new Map<string, { length: number; offset: number }>();

  for (let index = 0; index < declaredTableCount; index += 1) {
    const record = SFNT_HEADER_BYTES + index * SFNT_TABLE_RECORD_BYTES;
    // The record itself must be inside the buffer before any field of it can be read.
    if (record + SFNT_TABLE_RECORD_BYTES > bytes.byteLength) break;

    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    if (offset + length > bytes.byteLength) continue;

    tables.set(readSfntTag(bytes, record), { length, offset });
  }

  return { declaredTableCount, sfntVersion: view.getUint32(0), tables };
}

// A table tag is four bytes read as characters rather than as a number, because that is how every
// specification, every font tool, and every error message spells it — `glyf`, `cmap`, `CFF ` with its
// significant trailing space. Keeping the string form means a tag never has to be decoded by a reader.
export function readSfntTag(bytes: Readonly<Uint8Array>, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}
