import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { Decompressor, ImportDiagnostic, WoffChecksumMismatch } from '@flighthq/types/contract';
import { Compression, CompressionFraming, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { assembleSfntFont, computeSfntTableChecksum } from './sfntAssembly';

// WOFF is a wrapper, not a font format: the same sfnt tables, each optionally deflated, behind a header
// that says where they went. So the whole job is to REBUILD THE SFNT and hand it to the reader that
// already exists — no new outline code, no new seam, and `glyf`, `CFF ` and CID all work through it
// unchanged because they never learn the bytes arrived wrapped.
//
// The container layout is an interface fact about the format. The reconstruction is Flight's own.
//
// ★ THE DECOMPRESSOR IS NOT BUNDLED HERE, DELIBERATELY. It is fetched from `@flighthq/compression`'s
// registry, which a caller opts into with `registerDeflateDecompressor()`. Importing the codec directly
// would drag DEFLATE into every bundle that reads a `.ttf`, which is the bundle invariant this repository
// enforces — an assembly never inflates the bundle cost of a primitive. The cost of that choice is that
// an unregistered decompressor is a real outcome, so it gets its own reported reason rather than being
// folded into "unsupported container".

const WOFF_HEADER_BYTES = 44;
const WOFF_DIRECTORY_ENTRY_BYTES = 20;

// Which tables' stored checksums disagree with their own bytes. Returns an empty array when every
// table agrees, and for a container this reader cannot open at all — a caller distinguishes those by
// whether `readWoffFont` returned a font.
//
// ★ REPORTED, NEVER ENFORCED. A mismatch is bad data rather than API misuse, so it takes a sentinel
// and not a throw, and the font still loads: deciding that a font is unacceptable belongs to the
// caller, and a reader that refused one which would otherwise work would have taken that decision
// away with no way to opt out. Kept as a separate query so a caller who never asks does not link the
// arithmetic — the same shape as `explainOpenTypeFont`, for the same reason.
export function readWoffChecksumMismatches(
  bytes: Readonly<Uint8Array>,
  decompress: Decompressor | null,
): readonly WoffChecksumMismatch[] {
  if (bytes.byteLength < WOFF_HEADER_BYTES) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const tableCount = view.getUint16(12);
  const directoryEnd = WOFF_HEADER_BYTES + tableCount * WOFF_DIRECTORY_ENTRY_BYTES;
  if (tableCount === 0 || directoryEnd > bytes.byteLength) return [];

  const mismatches: WoffChecksumMismatch[] = [];
  for (let index = 0; index < tableCount; index += 1) {
    const record = WOFF_HEADER_BYTES + index * WOFF_DIRECTORY_ENTRY_BYTES;
    const tag = view.getUint32(record);
    const offset = view.getUint32(record + 4);
    const compressedLength = view.getUint32(record + 8);
    const originalLength = view.getUint32(record + 12);
    const stored = view.getUint32(record + 16);
    if (offset + compressedLength > bytes.byteLength) continue;

    const raw = bytes.subarray(offset, offset + compressedLength);
    let data: Uint8Array | null = raw as Uint8Array;
    if (compressedLength !== originalLength) {
      if (decompress === null) continue;
      data = decompress(raw, originalLength, CompressionFraming.Rfc1950);
      if (data === null || data.byteLength !== originalLength) continue;
    }

    const computed = computeSfntTableChecksum(data, tag === HEAD_TAG);
    if (computed !== stored) {
      mismatches.push({ computed, stored, tag: readWoffTagText(view, record) });
    }
  }
  return mismatches;
}

// The compression this container uses. Named through the shared vocabulary rather than a local constant so
// a caller registering a codec and this module asking for one cannot drift apart.
export const WOFF_COMPRESSION: Compression = Compression.Deflate;

// Rebuilds the plain sfnt a WOFF wraps. Returns the null sentinel for a malformed container, and for a
// deflated table when no decompressor is registered — the caller distinguishes those through
// `explainOpenTypeFont`, since one wants a repaired file and the other wants one line of registration.
export function readWoffFont(
  bytes: Readonly<Uint8Array>,
  decompress: Decompressor | null,
  diagnostics?: ImportDiagnostic[],
): Uint8Array | null {
  if (bytes.byteLength < WOFF_HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const tableCount = view.getUint16(12);
  if (tableCount === 0) return null;
  const directoryEnd = WOFF_HEADER_BYTES + tableCount * WOFF_DIRECTORY_ENTRY_BYTES;
  if (directoryEnd > bytes.byteLength) return null;

  // The wrapper carries the sfnt version the tables belonged to, so the rebuilt font declares the flavor
  // it actually is rather than one inferred from which tables happen to be present.
  const flavor = view.getUint32(4);

  interface WoffTable {
    data: Uint8Array;
    tag: number;
  }
  const tables: WoffTable[] = [];

  for (let index = 0; index < tableCount; index += 1) {
    const record = WOFF_HEADER_BYTES + index * WOFF_DIRECTORY_ENTRY_BYTES;
    const tag = view.getUint32(record);
    const offset = view.getUint32(record + 4);
    const compressedLength = view.getUint32(record + 8);
    const originalLength = view.getUint32(record + 12);
    if (offset + compressedLength > bytes.byteLength) return null;

    const stored = bytes.subarray(offset, offset + compressedLength);
    // A table is stored uncompressed when the two lengths match — the format's own way of saying
    // "compressing this one did not pay", so it is a normal case rather than an edge one.
    if (compressedLength === originalLength) {
      tables.push({ data: stored as Uint8Array, tag });
      continue;
    }

    if (decompress === null) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Reject,
        'woff.no-decompressor-registered',
        'readWoffFont',
        { table: readWoffTagText(view, record) },
      );
      return null;
    }
    const inflated = decompress(stored, originalLength, CompressionFraming.Rfc1950);
    // A decompressor that returns the wrong length has produced something that is not this table, and
    // reassembling it would yield a font whose directory lengths lie about its own contents.
    if (inflated === null || inflated.byteLength !== originalLength) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Reject,
        'woff.decompression-failed',
        'readWoffFont',
        {
          compressedLength,
          originalLength,
          outputLength: inflated?.byteLength ?? -1,
          table: readWoffTagText(view, record),
        },
      );
      return null;
    }
    tables.push({ data: inflated, tag });
  }

  return assembleSfntFont(flavor, tables);
}

// The four-character tag as text, for a caller that will show it or key on it.
function readWoffTagText(view: Readonly<DataView>, record: number): string {
  return String.fromCharCode(
    view.getUint8(record),
    view.getUint8(record + 1),
    view.getUint8(record + 2),
    view.getUint8(record + 3),
  );
}

const HEAD_TAG = 0x68656164;
