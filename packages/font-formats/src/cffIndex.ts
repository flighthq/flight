import type { CffIndex, CffIndexEntry } from '@flighthq/types/contract';

// The CFF INDEX: the container every other CFF structure is stored in.
//
// An INDEX is a count, an offset width, `count + 1` offsets, and then the data those offsets carve up.
// Offsets are 1-based from the byte before the data block, which is the one detail that makes an
// off-by-one here silent rather than loud — it yields a shifted-but-plausible entry rather than a crash.
//
// Layout is an interface fact about the format. The reading is Flight's own.
//
// A CFF table holds five of these in a fixed order (name, top DICT, string, global subroutines) plus
// two reached by offset (charstrings, local subroutines), so this is the primitive the rest composes on.

// Reads one INDEX at `offset`. Returns the null sentinel for a structurally impossible one rather than a
// partial read: a truncated INDEX yields entry ranges that point at arbitrary bytes, and every consumer
// downstream would interpret those as real charstrings or DICTs.
export function readCffIndex(bytes: Readonly<Uint8Array>, offset: number): CffIndex | null {
  if (offset + 2 > bytes.byteLength) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(offset);

  // A count of zero is a legitimate empty INDEX and occupies exactly its two-byte count. Fonts with no
  // local subroutines rely on this, so it is a normal answer rather than an edge case.
  if (count === 0) return { endOffset: offset + 2, entries: [] };

  const offSize = view.getUint8(offset + 2);
  if (offSize < 1 || offSize > 4) return null;

  const offsetsAt = offset + 3;
  const dataAt = offsetsAt + (count + 1) * offSize - 1;
  if (dataAt >= bytes.byteLength) return null;

  const readOffset = (index: number): number => {
    let value = 0;
    for (let byte = 0; byte < offSize; byte += 1)
      value = value * 256 + view.getUint8(offsetsAt + index * offSize + byte);
    return value;
  };

  const entries: CffIndexEntry[] = [];
  let previous = readOffset(0);
  // The first offset is 1 by definition; anything else means the offsets are not what this INDEX claims.
  if (previous !== 1) return null;

  for (let index = 0; index < count; index += 1) {
    const next = readOffset(index + 1);
    // Offsets must not run backwards, and the last must stay inside the buffer. Both conditions are the
    // difference between a truncated file and one that merely holds an empty entry, which is legal.
    if (next < previous || dataAt + next > bytes.byteLength) return null;
    entries.push({ end: dataAt + next, start: dataAt + previous });
    previous = next;
  }

  return { endOffset: dataAt + previous, entries };
}
