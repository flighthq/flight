// Unicode bidirectional-text itemize seam (UAX #9). Free functions in @flighthq/textbidi resolve the
// embedding levels of a mixed LTR/RTL string and reorder its runs from logical (storage) to visual
// (display) order. Each character's bidi class comes from the active BidiClassBackend — the default is
// a compact bundled table (@flighthq/textbidi's own data) covering the common Latin/Hebrew/Arabic
// ranges; a full-coverage backend (a flight-rs Rust table kernel) replaces it via setBidiClassBackend.
// Unlike segmentation (UAX #29), the ECMAScript Intl API exposes NO bidi surface, so there is no
// zero-bundle web backend — the algorithm needs each character's bidi class carried as data.

// The 23 bidirectional character classes of UAX #9 (table 4). Strong: L (left-to-right), R
// (right-to-left), AL (right-to-left Arabic). Weak: EN (European number), ES (European separator), ET
// (European terminator), AN (Arabic number), CS (common separator), NSM (nonspacing mark), BN
// (boundary neutral). Neutral: B (paragraph separator), S (segment separator), WS (whitespace), ON
// (other neutral). Explicit formatting: LRE/RLE/LRO/RLO (embeddings/overrides), PDF (pop), and the
// isolates LRI/RLI/FSI (initiators) and PDI (pop directional isolate).
export type BidiClass =
  | 'L'
  | 'R'
  | 'AL'
  | 'EN'
  | 'ES'
  | 'ET'
  | 'AN'
  | 'CS'
  | 'NSM'
  | 'BN'
  | 'B'
  | 'S'
  | 'WS'
  | 'ON'
  | 'LRE'
  | 'RLE'
  | 'LRO'
  | 'RLO'
  | 'PDF'
  | 'LRI'
  | 'RLI'
  | 'FSI'
  | 'PDI';

// The class-lookup seam the UAX #9 algorithm queries per code point. A single method keeps a
// from-scratch or native backend to one function to implement. The compact default answers the common
// scripts; a complete-coverage backend (flight-rs) swaps in via setBidiClassBackend for full Unicode.
export interface BidiClassBackend {
  // Returns the UAX #9 bidi class of `codepoint` (a Unicode scalar value, not a UTF-16 code unit).
  getBidiClass(codepoint: number): BidiClass;
}

// The paragraph base direction fed to the algorithm. 'ltr'/'rtl' fix the base level (0/1); 'auto'
// derives it from the first strong character (UAX #9 rules P2/P3) — L → ltr, R/AL → rtl, none → ltr.
export type BidiDirection = 'ltr' | 'rtl' | 'auto';

// One resolved directional run: a maximal span of the string sharing one embedding `level`. The range
// is half-open [start, end) in UTF-16 code units. `direction` is derived from the level parity
// (even → 'ltr', odd → 'rtl'); a shaper shapes each run in its own direction, and a line places runs
// in visual order via reorderBidiLine.
export interface BidiRun {
  start: number;
  end: number;
  level: number;
  direction: 'ltr' | 'rtl';
}
