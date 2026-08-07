import type { CffIndexEntry, CffTable, SfntTableDirectory } from '@flighthq/types/contract';

import {
  CFF_OPERATOR_CHARSTRINGS,
  CFF_OPERATOR_FD_ARRAY,
  CFF_OPERATOR_FD_SELECT,
  CFF_OPERATOR_PRIVATE,
  CFF_OPERATOR_ROS,
  CFF_OPERATOR_SUBRS,
  readCffDict,
} from './cffDict';
import { readCffIndex } from './cffIndex';

// Assembles the parts of a `CFF ` table an outline reader needs: the charstrings, and the two subroutine
// pools they call into.
//
// The walk is fixed by the format — header, then name / top DICT / string / global subroutine INDEXes in
// that order — and everything after is reached by offsets read from the top DICT. Offsets in the top DICT
// are from the start of the TABLE; the local subroutine offset is from the start of the PRIVATE DICT.
// Mixing those two bases is the mistake that yields a real-but-wrong subroutine pool, which draws
// plausible garbage instead of failing.

// Returns the null sentinel for anything this package cannot read, INCLUDING a CID-keyed font. That is a
// deliberate refusal rather than a gap: a CID font reaches its charstrings through an FDSelect/FDArray
// indirection this package does not implement, so each glyph has its own private DICT and its own local
// subroutines, and the single-private-DICT read below is not reading what it assumes it is.
//
// WHAT THE REFUSAL IS **NOT** JUSTIFIED BY, since the first version of this comment claimed it: it is not
// established that such a font would fail silently. Measured instead of predicted — with no local
// subroutine pool, a charstring that calls one returns false, which is a VISIBLE failure rather than
// plausible garbage. Whether a given CID font lands there depends on whether its top DICT happens to
// carry a private entry at all, and that is not something this reader can know in advance.
// ⇒ SO THE REASON TO REFUSE IS THAT THE OUTCOME IS UNPREDICTABLE PER FONT, NOT THAT IT IS KNOWN TO BE
// SILENT. That is the narrower claim and the one the evidence supports.
export function readCffTable(bytes: Readonly<Uint8Array>, directory: Readonly<SfntTableDirectory>): CffTable | null {
  const table = directory.tables.get('CFF ');
  if (table === undefined || table.length < 4) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The header states its own size, so a future revision with extra header fields still parses.
  const headerSize = view.getUint8(table.offset + 2);
  const tableEnd = table.offset + table.length;

  const names = readCffIndex(bytes, table.offset + headerSize);
  if (names === null) return null;
  const topDicts = readCffIndex(bytes, names.endOffset);
  if (topDicts === null || topDicts.entries.length === 0) return null;
  const strings = readCffIndex(bytes, topDicts.endOffset);
  if (strings === null) return null;
  const globals = readCffIndex(bytes, strings.endOffset);
  if (globals === null) return null;

  const top = readCffDict(bytes, topDicts.entries[0]!.start, topDicts.entries[0]!.end);
  if (top === null) return null;
  if (top.has(CFF_OPERATOR_ROS) || top.has(CFF_OPERATOR_FD_ARRAY) || top.has(CFF_OPERATOR_FD_SELECT)) return null;

  const charstringsOffset = top.get(CFF_OPERATOR_CHARSTRINGS)?.[0];
  if (charstringsOffset === undefined) return null;
  const charstringsAt = table.offset + charstringsOffset;
  if (charstringsAt < table.offset || charstringsAt >= tableEnd) return null;
  const charstrings = readCffIndex(bytes, charstringsAt);
  if (charstrings === null) return null;

  return {
    charstrings: charstrings.entries,
    globalSubrs: globals.entries,
    localSubrs: readCffLocalSubrs(bytes, top, table.offset, tableEnd),
  };
}

// Local subroutines are optional: a font whose glyphs call none simply omits the operator, and an empty
// pool is the correct answer rather than a failure. Returned as an empty array so a caller never has to
// distinguish "absent" from "present but empty" — the biasing arithmetic treats them identically.
function readCffLocalSubrs(
  bytes: Readonly<Uint8Array>,
  top: ReadonlyMap<number, number[]>,
  tableOffset: number,
  tableEnd: number,
): readonly CffIndexEntry[] {
  const privateEntry = top.get(CFF_OPERATOR_PRIVATE);
  if (privateEntry === undefined || privateEntry.length < 2) return [];

  const [privateSize, privateOffset] = privateEntry as [number, number];
  const privateAt = tableOffset + privateOffset;
  if (privateAt < tableOffset || privateAt + privateSize > tableEnd) return [];

  const privateDict = readCffDict(bytes, privateAt, privateAt + privateSize);
  const subrsOffset = privateDict?.get(CFF_OPERATOR_SUBRS)?.[0];
  if (subrsOffset === undefined) return [];

  // Relative to the PRIVATE dict, not the table. This is the base that is easy to get wrong.
  const subrs = readCffIndex(bytes, privateAt + subrsOffset);
  return subrs === null ? [] : subrs.entries;
}
