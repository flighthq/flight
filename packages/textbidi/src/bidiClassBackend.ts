import type { BidiClass, BidiClassBackend } from '@flighthq/types';

// Builds the compact bundled bidi-class backend: a from-scratch UAX #9 class lookup over a sorted
// range table (binary search), covering the COMMON scripts — Basic Latin + Latin-1, the combining
// diacritical marks (NSM), the Hebrew block (R), the Arabic blocks + Arabic presentation forms
// (AL/AN/R), European/Arabic numbers, and the explicit embedding/override/isolate format characters.
// It is a few KB of range data, not the full Unicode database. Scripts outside these ranges (CJK,
// Indic, Thaana, N'Ko, Syriac, and the rest of Unicode) are NOT covered here — a codepoint with no
// range resolves to the safe common default 'L'. Full Unicode coverage (every assigned bidi class +
// bracket-pairing data) is the designated flight-rs table backend, swapped in via setBidiClassBackend.
export function createCompactBidiClassBackend(): BidiClassBackend {
  return { getBidiClass: getCompactBidiClass };
}

// Returns the active bidi-class backend, lazily creating the compact default the first time so there
// is always an answer. A full-coverage backend (flight-rs) replaces it via setBidiClassBackend;
// passing null there restores this lazy compact default.
export function getBidiClassBackend(): BidiClassBackend {
  if (_backend === null) _backend = createCompactBidiClassBackend();
  return _backend;
}

// Installs a bidi-class backend; pass null to fall back to the lazily-created compact default. Last
// write wins — registering over an existing backend replaces it. Opt-in and side-effect-free at
// import: nothing installs until a host calls this (or a resolve*/getBidiRuns query lazily builds the
// compact one).
export function setBidiClassBackend(backend: BidiClassBackend | null): void {
  _backend = backend;
}

let _backend: BidiClassBackend | null = null;

// Looks up `codepoint` in the sorted, non-overlapping range table by binary search. Each entry is
// three flat numbers [start, end, classOrdinal]; a hit returns the range's class, a miss the common
// default 'L' (the UAX #9 default for the assigned L-script ranges; unassigned/uncovered codepoints
// resolve LTR under the compact table — the full flight-rs backend distinguishes them).
function getCompactBidiClass(codepoint: number): BidiClass {
  let lo = 0;
  let hi = _rangeCount - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const base = mid * 3;
    const start = _ranges[base];
    if (codepoint < start) {
      hi = mid - 1;
    } else if (codepoint > _ranges[base + 1]) {
      lo = mid + 1;
    } else {
      return _classOrder[_ranges[base + 2]];
    }
  }
  return 'L';
}

// Class ordinals used inside the flat range table, so the table is pure numbers (compact, and cheap to
// scan). Index into this array with an entry's third number to recover the BidiClass string.
const _classOrder: readonly BidiClass[] = [
  'L',
  'R',
  'AL',
  'EN',
  'ES',
  'ET',
  'AN',
  'CS',
  'NSM',
  'BN',
  'B',
  'S',
  'WS',
  'ON',
  'LRE',
  'RLE',
  'LRO',
  'RLO',
  'PDF',
  'LRI',
  'RLI',
  'FSI',
  'PDI',
];

const L = 0;
const R = 1;
const AL = 2;
const EN = 3;
const ES = 4;
const ET = 5;
const AN = 6;
const CS = 7;
const NSM = 8;
const BN = 9;
const B = 10;
const S = 11;
const WS = 12;
const ON = 13;
const LRE = 14;
const RLE = 15;
const LRO = 16;
const RLO = 17;
const PDF = 18;
const LRI = 19;
const RLI = 20;
const FSI = 21;
const PDI = 22;

// The sorted, non-overlapping range table, flattened to [start, end, classOrdinal] triples. Kept in
// ascending `start` order so getCompactBidiClass can binary-search it. Ranges omitted from the table
// fall through to the 'L' default. This is the common-script subset; see createCompactBidiClassBackend
// for the coverage boundary.
// prettier-ignore
const _ranges: readonly number[] = [
  // Basic Latin (C0 controls, ASCII punctuation, digits, letters)
  0x0000, 0x0008, BN,
  0x0009, 0x0009, S,
  0x000a, 0x000a, B,
  0x000b, 0x000b, S,
  0x000c, 0x000c, WS,
  0x000d, 0x000d, B,
  0x000e, 0x001b, BN,
  0x001c, 0x001e, B,
  0x001f, 0x001f, S,
  0x0020, 0x0020, WS,
  0x0021, 0x0022, ON,
  0x0023, 0x0025, ET,
  0x0026, 0x002a, ON,
  0x002b, 0x002b, ES,
  0x002c, 0x002c, CS,
  0x002d, 0x002d, ES,
  0x002e, 0x002f, CS,
  0x0030, 0x0039, EN,
  0x003a, 0x003a, CS,
  0x003b, 0x0040, ON,
  0x0041, 0x005a, L,
  0x005b, 0x0060, ON,
  0x0061, 0x007a, L,
  0x007b, 0x007e, ON,
  0x007f, 0x0084, BN,
  0x0085, 0x0085, B,
  0x0086, 0x009f, BN,
  // Latin-1 Supplement
  0x00a0, 0x00a0, CS,
  0x00a1, 0x00a1, ON,
  0x00a2, 0x00a5, ET,
  0x00a6, 0x00a9, ON,
  0x00aa, 0x00aa, L,
  0x00ab, 0x00ac, ON,
  0x00ad, 0x00ad, BN,
  0x00ae, 0x00af, ON,
  0x00b0, 0x00b1, ET,
  0x00b2, 0x00b3, EN,
  0x00b4, 0x00b4, ON,
  0x00b5, 0x00b5, L,
  0x00b6, 0x00b8, ON,
  0x00b9, 0x00b9, EN,
  0x00ba, 0x00ba, L,
  0x00bb, 0x00bf, ON,
  0x00c0, 0x00d6, L,
  0x00d7, 0x00d7, ON,
  0x00d8, 0x00f6, L,
  0x00f7, 0x00f7, ON,
  0x00f8, 0x00ff, L,
  // Combining Diacritical Marks
  0x0300, 0x036f, NSM,
  // Hebrew block (letters R; points/accents NSM)
  0x0590, 0x0590, R,
  0x0591, 0x05bd, NSM,
  0x05be, 0x05be, R,
  0x05bf, 0x05bf, NSM,
  0x05c0, 0x05c0, R,
  0x05c1, 0x05c2, NSM,
  0x05c3, 0x05c3, R,
  0x05c4, 0x05c5, NSM,
  0x05c6, 0x05c6, R,
  0x05c7, 0x05c7, NSM,
  0x05c8, 0x05ff, R,
  // Arabic block (letters AL; marks NSM; digits AN/EN; separators)
  0x0600, 0x0605, AN,
  0x0606, 0x0607, ON,
  0x0608, 0x0608, AL,
  0x0609, 0x060a, ET,
  0x060b, 0x060b, AL,
  0x060c, 0x060c, CS,
  0x060d, 0x060f, AL,
  0x0610, 0x061a, NSM,
  0x061b, 0x064a, AL,
  0x064b, 0x065f, NSM,
  0x0660, 0x0669, AN,
  0x066a, 0x066a, ET,
  0x066b, 0x066c, AN,
  0x066d, 0x066f, AL,
  0x0670, 0x0670, NSM,
  0x0671, 0x06d5, AL,
  0x06d6, 0x06dc, NSM,
  0x06dd, 0x06de, AN,
  0x06df, 0x06e4, NSM,
  0x06e5, 0x06e6, AL,
  0x06e7, 0x06e8, NSM,
  0x06e9, 0x06e9, ON,
  0x06ea, 0x06ed, NSM,
  0x06ee, 0x06ef, AL,
  0x06f0, 0x06f9, EN,
  0x06fa, 0x06ff, AL,
  // Arabic Supplement + Extended-A
  0x0750, 0x077f, AL,
  0x08a0, 0x08ff, AL,
  // General punctuation whitespace/format run
  0x1680, 0x1680, WS,
  0x2000, 0x200a, WS,
  0x200b, 0x200d, BN,
  0x200e, 0x200e, L,
  0x200f, 0x200f, R,
  0x2010, 0x2027, ON,
  0x2028, 0x2028, WS,
  0x2029, 0x2029, B,
  0x202a, 0x202a, LRE,
  0x202b, 0x202b, RLE,
  0x202c, 0x202c, PDF,
  0x202d, 0x202d, LRO,
  0x202e, 0x202e, RLO,
  0x202f, 0x202f, CS,
  0x2030, 0x2034, ET,
  0x2035, 0x2059, ON,
  0x205f, 0x205f, WS,
  0x2060, 0x2064, BN,
  0x2066, 0x2066, LRI,
  0x2067, 0x2067, RLI,
  0x2068, 0x2068, FSI,
  0x2069, 0x2069, PDI,
  // Ideographic space
  0x3000, 0x3000, WS,
  // Hebrew + Arabic presentation forms
  0xfb1d, 0xfb1d, R,
  0xfb1e, 0xfb1e, NSM,
  0xfb1f, 0xfb4f, R,
  0xfb50, 0xfdcf, AL,
  0xfdf0, 0xfdff, AL,
  0xfe70, 0xfefe, AL,
  0xfeff, 0xfeff, BN,
];

const _rangeCount = _ranges.length / 3;
