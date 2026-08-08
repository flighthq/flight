// Verification oracles for `@flighthq/font-formats`, against a real font corpus.
//
// ★ THE INSTRUMENTS ARE COMMITTED; THE CORPUS IS NOT. Fonts arrive through `npm run fixtures`, and
// nothing here carries font bytes, tables derived from anyone's material, or a filename that only
// makes sense as a manifest of someone's archive. A path is supplied by the caller.
//
// ★★ NOTHING IN THIS FILE WALKS A CORPUS. Every export here is PURE — bounds objects, counts, deltas
// — and all are covered by the colocated test today. The corpus-walking halves were deliberately NOT
// committed: an instrument that cannot run reads as coverage to a later reader, so it is absent rather
// than present-and-marked. That is the same split `fixtures-core` uses: decisions are testable without
// I/O, walks are not. If a walk is ever added here it carries `untested-until-run`, retired per export
// on execution and naming which ones ran — a fetch alone can never retire it, because a fetch does not
// make a pure function execute any differently.
//
// WHY THESE AND NOT A GENERAL PIXEL DIFF: each answers a question the package's own tests structurally
// cannot. A bounding box is min/max over a point SET and a contour count is a COUNT, so both are
// invariant under a permutation — and the defect that motivated this suite was exactly a permutation.

// An sfnt `head` declares the union of every glyph's extent. Comparing a decoded union against it is a
// check on VALUE correctness that no table this package parses can supply, because `head` is written
// by the font's producer from the true outlines.
//
// ★ THIS RETURNS THE MEASUREMENT, NOT A VERDICT. Each delta is how far the decoded edge lies OUTSIDE
// the declared one, so positive means outside and negative means inside by that much. A function that
// returned only "exceeds" would put a semantic decision inside a measurement: the caller could still
// group verdicts afterwards, but the magnitudes would be gone and nothing could recover them.
// `classifyHeadBoundsDeltas` is the classification, kept separate so a caller chooses to apply it.
export function measureDecodedBoundsAgainstHead(
  declared: Readonly<{ xMax: number; xMin: number; yMax: number; yMin: number }>,
  decoded: Readonly<{ xMax: number; xMin: number; yMax: number; yMin: number }>,
): { xMax: number; xMin: number; yMax: number; yMin: number } {
  return {
    xMax: decoded.xMax - declared.xMax,
    xMin: declared.xMin - decoded.xMin,
    yMax: decoded.yMax - declared.yMax,
    yMin: declared.yMin - decoded.yMin,
  };
}

// The classification, over deltas somebody else measured.
//
// FOUR outcomes, because the line between "inside" and "outside" had TWO things behind it:
//
//   exact     — every edge sits on the declared bound.
//   contained — inside it. A WEAK pass: it cannot distinguish a loose declared box from a glyph the
//               reader failed to draw.
//   within-head-representable-precision — outside, but by LESS THAN ONE DESIGN UNIT.
//   exceeds   — outside by a unit or more. The only definite defect.
//
// ★ THE THIRD OUTCOME IS NAMED FOR ITS CAUSE, NOT ITS SIZE, AND THAT IS THE WHOLE POINT. `head`'s
// bounds are `int16` — integers — while CFF Type 2 operands may be 16.16 FIXED-POINT, so a decoded
// coordinate can be real-valued and the declared bound cannot represent it. A producer writing the
// nearest integer is off by strictly less than one unit, so THE BOUND IS DERIVED FROM THE
// REPRESENTATION rather than chosen: an excess of one unit or more CANNOT be explained by int16
// quantisation and is a defect.
//
// A band named for its size would be a fudge factor that absorbs the next unexplained excess. This one
// admits only what its cause explains. Measured instance: a CFF face decoding xMin as -634.2000427
// against a declared -634.
export function classifyHeadBoundsDeltas(
  deltas: Readonly<{ xMax: number; xMin: number; yMax: number; yMin: number }>,
): 'contained' | 'exact' | 'exceeds' | 'within-head-representable-precision' {
  const edges = [deltas.xMax, deltas.xMin, deltas.yMax, deltas.yMin];
  const worst = Math.max(...edges);
  if (worst >= HEAD_BOUNDS_QUANTISATION_UNIT) return 'exceeds';
  if (worst > 0) return 'within-head-representable-precision';
  return edges.every((delta) => delta === 0) ? 'exact' : 'contained';
}

// One design unit. `head` stores bounds as `int16`, so a real-valued coordinate written to an integer
// field differs from it by strictly less than this — a declared integer cannot sit a full unit outward
// or a nearer integer would have been written instead. Not a tolerance: change the field's width and
// this changes with it.
//
// ★ ONE, NOT A HALF, AND THE REASON IS ABOUT PRODUCERS WE HAVE NOT SEEN. A producer that rounds to
// nearest is off by at most a half, so 0.5 would fit the corpus in hand — but a producer that
// TRUNCATES toward zero is off by up to a whole unit, and 0.5 would start calling its valid fonts
// defective. 1.0 holds for every rounding convention. A bound tuned to the corpus you have is a bound
// that fails on the corpus you get.
//
// The same bound applies to all four edges even though their sign conventions are opposite — the
// deltas are already normalised so that positive means OUTSIDE, whichever edge it is.
const HEAD_BOUNDS_QUANTISATION_UNIT = 1;

// A `glyf` glyph declares `numberOfContours` in a field the point decoding never touches, so emitted
// contours versus declared contours is order-sensitive at exactly the boundary a stream permutation
// destroys — which a bounding box cannot see.
//
// Composite glyphs (negative count) are NOT comparable this way: their contours come from components
// rather than from this glyph's own points, so they are reported as skipped rather than counted as
// agreement. Folding them in would inflate the agreement figure with glyphs nothing checked.
//
// ★ A CALLER THAT FILTERS BEFORE CALLING THIS CANNOT DISTINGUISH "no composites existed" FROM "no
// composite ever reached the comparison" — both tally `skipped-composite` at zero, and the second is a
// walk that skipped a third of the corpus while reporting a clean sweep. Measured instance: a walk that
// dropped empty paths first counted 0 skipped over a corpus holding 33,299 composites. So call this for
// EVERY glyph and let it classify, and state the population in the output — "of N simple glyphs, with M
// composites not evaluated" — because a bare agreement count cannot say what it is over.
export function compareContourCount(
  declaredContours: number,
  emittedCloseCommands: number,
): 'agree' | 'disagree' | 'skipped-composite' {
  if (declaredContours < 0) return 'skipped-composite';
  return declaredContours === emittedCloseCommands ? 'agree' : 'disagree';
}

// Where a WOFF2's compressed stream begins.
//
// ★ THE TRAP THIS EXISTS TO DOCUMENT: deriving the start by subtracting `totalCompressedSize` from the
// END of the file lands inside the format's trailing padding, and the result DECODES AS A VALID BUT
// EMPTY STREAM. That is a false green — a decompressor reports success and carries nothing. The start
// is only knowable by walking the variable-length table directory, so it is passed in here.
export function woff2StreamRange(
  directoryEnd: number,
  totalCompressedSize: number,
  byteLength: number,
): { end: number; start: number } | null {
  const end = directoryEnd + totalCompressedSize;
  if (directoryEnd < 0 || totalCompressedSize <= 0 || end > byteLength) return null;
  return { end, start: directoryEnd };
}

// Per-contour signed area; its SIGN is the winding direction. A ring requires the outer contour and its
// counter to have OPPOSITE signs, and that is the only property here that distinguishes a hole from a
// solid — a bounding box and a contour count are both identical either way.
//
// Reversing BOTH contours is deliberately NOT a defect: measured against a browser's nonzero fill, it
// paints the identical hole, because only the relative direction of the two contours matters.
export function contoursWindOppositely(signedAreas: readonly number[]): boolean {
  if (signedAreas.length < 2) return false;
  const first = Math.sign(signedAreas[0]!);
  return signedAreas.slice(1).every((area) => Math.sign(area) !== first);
}

// Tallies a WOFF2 flag stream's high bit against the same glyphs read from a plain sfnt, to decide
// which sense the bit carries. `sfntOnCurve` is ground truth from an independent build of the same
// font; `woff2Flags` is the transformed table's per-point flag byte.
//
// ★ A PERFECT SCORE IS AN ARTIFACT WHEN EITHER SIDE IS CONSTANT, so the counts of both classes are
// returned rather than only the agreement. If every point is on-curve, "high bit means off-curve"
// scores 100% while discriminating nothing — the caller must check `sfntOnCurveCount` and
// `sfntOffCurveCount` are both non-zero before reading the agreement as evidence.
export function tallyWoff2OnCurveSense(
  woff2Flags: Readonly<Uint8Array>,
  sfntOnCurve: readonly boolean[],
): Woff2OnCurveSenseTally {
  let highMeansOnCurve = 0;
  let highMeansOffCurve = 0;
  let sfntOnCurveCount = 0;
  let sfntOffCurveCount = 0;

  for (let point = 0; point < sfntOnCurve.length; point += 1) {
    const high = ((woff2Flags[point] ?? 0) & 0x80) !== 0;
    const on = sfntOnCurve[point] === true;
    if (high === on) highMeansOnCurve += 1;
    else highMeansOffCurve += 1;
    if (on) sfntOnCurveCount += 1;
    else sfntOffCurveCount += 1;
  }
  return { highMeansOffCurve, highMeansOnCurve, sfntOffCurveCount, sfntOnCurveCount };
}

export interface Woff2OnCurveSenseTally {
  highMeansOffCurve: number;
  highMeansOnCurve: number;
  sfntOffCurveCount: number;
  sfntOnCurveCount: number;
}

// Whether a bbox-stream layout accounts for its own length exactly: the presence bitmap, then one
// eight-byte box per set bit. Order-independent, since a popcount does not depend on bit order, so this
// checks the SIZE of the bitmap without assuming which end its bits start from.
//
// ★ THIS IS THE CHECK THAT CATCHES A BITMAP ROUNDED TO A BYTE INSTEAD OF TO 32 BITS — but only on a
// font whose glyph count distinguishes them. A count that is a multiple of 32 rounds identically under
// both rules and can never fail this, however wrong the reader is.
export function accountsForWoff2BboxStream(
  bboxStreamByteLength: number,
  bitmapByteLength: number,
  setBitCount: number,
): boolean {
  return bitmapByteLength + setBitCount * 8 === bboxStreamByteLength;
}

// Whether two decoded outlines are the same shape: identical contour ends, points and on-curve flags.
//
// ★ THIS IS THE CORRECTNESS MEASURE FOR AN ENCODER, AND A BYTE COMPARISON IS NOT. The `glyf` point
// encoding admits several spellings of the same outline — a zero delta may be omitted, a small delta
// written short or long, a run of identical flags collapsed or not — so a re-encoded glyph can differ
// byte-for-byte from the producer's while describing exactly the same shape. Byte equality measures
// agreement with one producer's choices; this measures whether the geometry survived.
export function outlinesAreIdentical(
  left: Readonly<{
    endPtsOfContours: readonly number[];
    onCurve: readonly boolean[];
    xs: readonly number[];
    ys: readonly number[];
  }>,
  right: Readonly<{
    endPtsOfContours: readonly number[];
    onCurve: readonly boolean[];
    xs: readonly number[];
    ys: readonly number[];
  }>,
): boolean {
  if (left.xs.length !== right.xs.length) return false;
  if (left.endPtsOfContours.length !== right.endPtsOfContours.length) return false;
  for (let index = 0; index < left.endPtsOfContours.length; index += 1) {
    if (left.endPtsOfContours[index] !== right.endPtsOfContours[index]) return false;
  }
  for (let index = 0; index < left.xs.length; index += 1) {
    if (left.xs[index] !== right.xs[index]) return false;
    if (left.ys[index] !== right.ys[index]) return false;
    if (left.onCurve[index] !== right.onCurve[index]) return false;
  }
  return true;
}
