import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

import {
  assembleSfntFont,
  decodeWoff2Triplet,
  getWoff2BboxBitmapByteLength,
  hasWoff2GlyphBbox,
  measureWoff2CompositeGlyph,
  readSfntTableDirectory,
  readWoff2GlyfStreams,
  readWoff2Short,
  packSfntTag,
  readWoff2TableDirectory,
  reverseWoff2GlyfTransform,
} from '@flighthq/font-formats/contract';

import { accountsForWoff2BboxStream, outlinesAreIdentical, tallyWoff2OnCurveSense } from './font-oracles';

// Measures Flight's WOFF2 `glyf` reversal against ground truth, by comparing a transformed WOFF2 with
// the SAME font shipped as a plain `.ttf`. Every claim this repository makes about the reversal — the
// on-curve sense, the bbox bitmap layout, the point counts — is produced by this script and by nothing
// else, so a figure quoted anywhere can be re-derived by running it.
//
// ★ THE PAIR IS THE ORACLE, AND WITHOUT ONE THERE IS NO MEASUREMENT HERE. A WOFF2 read in isolation can
// only be checked for self-consistency, which a wrong-but-consistent reader passes. The independent
// `.ttf` build is what makes the comparison capable of failing.
//
// Fonts are read on demand from a fixture pool outside the repository and nothing is copied in; see
// `scripts/fixtures.ts` for the pinned release and how to fetch it.

// One glyph's outline in the plain form both sides are compared in.
export interface OracleOutline {
  endPtsOfContours: number[];
  onCurve: boolean[];
  xs: number[];
  ys: number[];
}

export interface Woff2ReversalReport {
  // Non-null only when the two files disagree about how many glyphs the font has, which means they are
  // not builds of the same font and every other number would be meaningless.
  glyphCountMismatch: string | null;
  // Whether the bbox sub-stream's own length is accounted for by the bitmap plus one box per set bit.
  bboxStreamAccounted: boolean;
  // Point counts derived from `nPointsStream` that matched the paired `.ttf` exactly. Reported as a
  // POSITIVE MATCH against independent ground truth rather than as an absence of failures.
  pointCountMatches: number;
  simpleGlyphs: number;
  // Composites whose bbox bit is set. The format requires an explicit box for every composite, so a
  // shortfall here means the bitmap is being read with the wrong bit order or the wrong padding.
  compositesWithBbox: number;
  composites: number;
  highMeansOffCurve: number;
  highMeansOnCurve: number;
  sfntOffCurvePoints: number;
  sfntOnCurvePoints: number;
}

// Reads a `.ttf` glyph into the comparison form, or null for an empty or composite glyph. The flag
// decoding is deliberately independent of the WOFF2 path: the two must be able to disagree.
export function readSfntGlyphOutline(ttf: Readonly<Uint8Array>, glyphIndex: number): OracleOutline | null {
  const directory = readSfntTableDirectory(ttf);
  if (directory === null) return null;
  const head = directory.tables.get('head');
  const loca = directory.tables.get('loca');
  const glyf = directory.tables.get('glyf');
  if (head === undefined || loca === undefined || glyf === undefined) return null;

  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const longLoca = view.getInt16(head.offset + 50) !== 0;
  const start = longLoca
    ? view.getUint32(loca.offset + glyphIndex * 4)
    : view.getUint16(loca.offset + glyphIndex * 2) * 2;
  const end = longLoca
    ? view.getUint32(loca.offset + (glyphIndex + 1) * 4)
    : view.getUint16(loca.offset + (glyphIndex + 1) * 2) * 2;
  if (end <= start) return null;

  let at = glyf.offset + start;
  const contours = view.getInt16(at);
  if (contours < 0) return null;
  at += 10;

  const endPtsOfContours: number[] = [];
  for (let contour = 0; contour < contours; contour += 1) {
    endPtsOfContours.push(view.getUint16(at));
    at += 2;
  }
  const pointCount = (endPtsOfContours[contours - 1] ?? -1) + 1;
  at += 2 + view.getUint16(at);

  const flags: number[] = [];
  while (flags.length < pointCount) {
    const flag = ttf[at]!;
    at += 1;
    flags.push(flag);
    // REPEAT_FLAG: the following byte says how many further points share this flag.
    if ((flag & 0x08) !== 0) {
      const repeat = ttf[at]!;
      at += 1;
      for (let index = 0; index < repeat && flags.length < pointCount; index += 1) flags.push(flag);
    }
  }

  const xs: number[] = [];
  let x = 0;
  for (const flag of flags) {
    if ((flag & 0x02) !== 0) {
      const byte = ttf[at]!;
      at += 1;
      x += (flag & 0x10) !== 0 ? byte : -byte;
    } else if ((flag & 0x10) === 0) {
      x += view.getInt16(at);
      at += 2;
    }
    xs.push(x);
  }
  const ys: number[] = [];
  let y = 0;
  for (const flag of flags) {
    if ((flag & 0x04) !== 0) {
      const byte = ttf[at]!;
      at += 1;
      y += (flag & 0x20) !== 0 ? byte : -byte;
    } else if ((flag & 0x20) === 0) {
      y += view.getInt16(at);
      at += 2;
    }
    ys.push(y);
  }
  return { endPtsOfContours, onCurve: flags.map((flag) => (flag & 0x01) !== 0), xs, ys };
}

// Splits a WOFF2's decompressed table block back into the tables the directory declares.
export function readWoff2RawTables(woff2: Readonly<Uint8Array>): Map<string, Uint8Array> | null {
  const directory = readWoff2TableDirectory(woff2);
  if (directory === null) return null;
  const view = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);

  let block: Uint8Array;
  try {
    block = new Uint8Array(
      brotliDecompressSync(woff2.subarray(directory.streamStart, directory.streamStart + view.getUint32(20))),
    );
  } catch {
    return null;
  }

  const tables = new Map<string, Uint8Array>();
  let at = 0;
  for (const entry of directory.entries) {
    const length = entry.transformed ? entry.transformLength : entry.originalLength;
    tables.set(entry.tag, block.subarray(at, at + length));
    at += length;
  }
  return tables;
}

// Walks one matched pair and reports every comparison as counts. Returns null when the WOFF2 cannot be
// opened or carries no transformed `glyf`, which is a skip rather than a failure.
export function measureWoff2ReversalPair(
  ttf: Readonly<Uint8Array>,
  woff2: Readonly<Uint8Array>,
): Woff2ReversalReport | null {
  const tables = readWoff2RawTables(woff2);
  if (tables === null) return null;
  const transformed = tables.get('glyf');
  if (transformed === undefined) return null;
  const streams = readWoff2GlyfStreams(transformed);
  if (streams === null) return null;

  const sfntDirectory = readSfntTableDirectory(ttf);
  const maxp = sfntDirectory?.tables.get('maxp');
  if (sfntDirectory === undefined || sfntDirectory === null || maxp === undefined) return null;
  const sfntGlyphCount = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength).getUint16(maxp.offset + 4);

  const report: Woff2ReversalReport = {
    bboxStreamAccounted: false,
    composites: 0,
    compositesWithBbox: 0,
    glyphCountMismatch:
      sfntGlyphCount === streams.glyphCount
        ? null
        : `ttf declares ${sfntGlyphCount}, woff2 declares ${streams.glyphCount}`,
    highMeansOffCurve: 0,
    highMeansOnCurve: 0,
    pointCountMatches: 0,
    sfntOffCurvePoints: 0,
    sfntOnCurvePoints: 0,
    simpleGlyphs: 0,
  };
  if (report.glyphCountMismatch !== null) return report;

  const bitmapBytes = getWoff2BboxBitmapByteLength(streams.glyphCount);
  let setBits = 0;
  for (let index = 0; index < bitmapBytes; index += 1) {
    let byte = streams.bboxStream[index] ?? 0;
    while (byte !== 0) {
      setBits += byte & 1;
      byte >>= 1;
    }
  }
  report.bboxStreamAccounted = accountsForWoff2BboxStream(streams.bboxStream.byteLength, bitmapBytes, setBits);

  const contourView = new DataView(
    streams.nContourStream.buffer,
    streams.nContourStream.byteOffset,
    streams.nContourStream.byteLength,
  );
  const points = { at: 0 };
  const glyph = { at: 0 };
  let compositeAt = 0;
  let flagAt = 0;

  for (let index = 0; index < streams.glyphCount; index += 1) {
    const contours = contourView.getInt16(index * 2);
    if (contours === 0) continue;

    if (contours < 0) {
      report.composites += 1;
      if (hasWoff2GlyphBbox(streams.bboxStream, index)) report.compositesWithBbox += 1;
      const measured = measureWoff2CompositeGlyph(streams.compositeStream, compositeAt);
      if (measured === null) break;
      compositeAt += measured.byteLength;
      // The instruction length lives in the GLYPH stream even for a composite; missing it here
      // desynchronises every simple glyph that follows.
      if (measured.hasInstructions) readWoff2Short(streams.glyphStream, glyph, streams.glyphStream.byteLength);
      continue;
    }

    let pointCount = 0;
    for (let contour = 0; contour < contours; contour += 1) {
      const count = readWoff2Short(streams.nPointsStream, points, streams.nPointsStream.byteLength);
      if (count < 0) return report;
      pointCount += count;
    }
    report.simpleGlyphs += 1;

    const flags = streams.flagStream.subarray(flagAt, flagAt + pointCount);
    flagAt += pointCount;
    for (let point = 0; point < pointCount; point += 1) {
      const decoded = decodeWoff2Triplet(flags[point]! & 0x7f, streams.glyphStream, glyph.at);
      if (decoded === null) return report;
      glyph.at += decoded.used;
    }
    readWoff2Short(streams.glyphStream, glyph, streams.glyphStream.byteLength);

    const truth = readSfntGlyphOutline(ttf, index);
    if (truth === null || truth.xs.length !== pointCount) continue;
    report.pointCountMatches += 1;

    const tally = tallyWoff2OnCurveSense(flags, truth.onCurve);
    report.highMeansOnCurve += tally.highMeansOnCurve;
    report.highMeansOffCurve += tally.highMeansOffCurve;
    report.sfntOnCurvePoints += tally.sfntOnCurveCount;
    report.sfntOffCurvePoints += tally.sfntOffCurveCount;
  }
  return report;
}

// Sums per-pair reports into the totals a finding would quote. Kept separate from the walk so the
// aggregation can be checked on its own — and so a caller can print the PER-PAIR rows, which is what
// exposes a split that a total averages away.
export function runWoff2ReversalOracle(
  pairs: readonly Readonly<{ ttf: Readonly<Uint8Array>; woff2: Readonly<Uint8Array> }>[],
): { pairs: number; reports: Woff2ReversalReport[]; totals: Woff2ReversalReport } {
  const reports: Woff2ReversalReport[] = [];
  for (const pair of pairs) {
    const report = measureWoff2ReversalPair(pair.ttf, pair.woff2);
    if (report !== null) reports.push(report);
  }

  const totals: Woff2ReversalReport = {
    bboxStreamAccounted: reports.every((report) => report.bboxStreamAccounted),
    composites: 0,
    compositesWithBbox: 0,
    glyphCountMismatch: reports.find((report) => report.glyphCountMismatch !== null)?.glyphCountMismatch ?? null,
    highMeansOffCurve: 0,
    highMeansOnCurve: 0,
    pointCountMatches: 0,
    sfntOffCurvePoints: 0,
    sfntOnCurvePoints: 0,
    simpleGlyphs: 0,
  };
  for (const report of reports) {
    totals.composites += report.composites;
    totals.compositesWithBbox += report.compositesWithBbox;
    totals.highMeansOffCurve += report.highMeansOffCurve;
    totals.highMeansOnCurve += report.highMeansOnCurve;
    totals.pointCountMatches += report.pointCountMatches;
    totals.sfntOffCurvePoints += report.sfntOffCurvePoints;
    totals.sfntOnCurvePoints += report.sfntOnCurvePoints;
    totals.simpleGlyphs += report.simpleGlyphs;
  }
  return { pairs: reports.length, reports, totals };
}

// Whether an encoder preserved an outline exactly. Byte equality against a producer measures agreement
// with its spelling choices; this measures whether the shape survived, which is the correctness claim.
export function encoderPreservedOutline(before: Readonly<OracleOutline>, after: Readonly<OracleOutline>): boolean {
  return outlinesAreIdentical(before, after);
}

// Command entry: point it at a directory holding matched `.ttf` and `.woff2` builds of the same fonts
// and it prints one row per pair plus the totals. Pairs are matched on basename, and BOTH forms are
// searched recursively because real packs file them separately — a static build and a variable build
// of one family sit in different directories, and a non-recursive match silently drops the variable
// ones, which are exactly the fonts whose glyph counts expose a bbox-bitmap rounding error.
//
// ★ PER-PAIR ROWS ARE PRINTED, NOT JUST TOTALS, ON PURPOSE. A pooled score averages away a split
// between two populations, and the split is usually the finding.
export function formatWoff2ReversalOracleReport(result: ReturnType<typeof runWoff2ReversalOracle>): string {
  const lines: string[] = [];
  for (const report of result.reports) {
    lines.push(
      `  simple=${report.simpleGlyphs} pointCountMatches=${report.pointCountMatches} ` +
        `composites=${report.compositesWithBbox}/${report.composites} bboxAccounted=${report.bboxStreamAccounted} ` +
        `highMeansOff=${report.highMeansOffCurve} highMeansOn=${report.highMeansOnCurve}`,
    );
  }
  const totals = result.totals;
  lines.push(`  pairs measured: ${result.pairs}`);
  lines.push(`  point counts matching the paired ttf: ${totals.pointCountMatches}/${totals.simpleGlyphs}`);
  lines.push(`  composites carrying an explicit bbox: ${totals.compositesWithBbox}/${totals.composites}`);
  lines.push(`  bbox stream accounted for in every pair: ${totals.bboxStreamAccounted}`);
  lines.push(
    `  on-curve sense — high bit means OFF: ${totals.highMeansOffCurve}  means ON: ${totals.highMeansOnCurve}`,
  );
  // Without both classes present the agreement above is vacuous, so the denominator is printed beside it.
  lines.push(`  ground-truth classes — on-curve: ${totals.sfntOnCurvePoints} off-curve: ${totals.sfntOffCurvePoints}`);
  return lines.join('\n');
}

// Collects matched pairs from a directory tree: files sharing a basename, one `.ttf` and one `.woff2`.
//
// ★ THE SEARCH IS RECURSIVE BECAUSE REAL PACKS FILE THE TWO FORMS APART. A family's static builds and
// its variable build live in different directories, so a flat match drops the variable ones — and those
// are precisely the fonts whose glyph counts can expose a bbox-bitmap rounding error, since a count
// that is a multiple of 32 rounds identically under a right and a wrong rule.
export function collectWoff2ReversalPairs(directory: string): { ttf: Uint8Array; woff2: Uint8Array }[] {
  const files: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at)) {
      const path = join(at, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(directory);

  const sfnt = new Map<string, string>();
  const woff2 = new Map<string, string>();
  for (const file of files) {
    const stem = basename(file, extname(file));
    if (file.endsWith('.ttf')) sfnt.set(stem, file);
    if (file.endsWith('.woff2')) woff2.set(stem, file);
  }
  return [...woff2.keys()]
    .filter((stem) => sfnt.has(stem))
    .sort()
    .map((stem) => ({
      ttf: new Uint8Array(readFileSync(sfnt.get(stem)!)),
      woff2: new Uint8Array(readFileSync(woff2.get(stem)!)),
    }));
}

// Reverses a WOFF2's transformed `glyf` and compares every reconstructed outline with the same glyph
// read from the paired `.ttf`. This is the end-to-end claim: not that the streams parse, but that what
// comes out the far side is the font that went in.
//
// ★ GEOMETRY IS COMPARED, NOT BYTES, AND THE DIFFERENCE IS NOT A CONCESSION. The `glyf` point encoding
// admits several spellings of one outline — an omitted zero delta, a short or long delta, a collapsed
// or expanded run of equal flags — so a correct re-encode routinely differs byte-for-byte from the
// producer's. Byte equality would measure agreement with one font tool's habits; this measures whether
// the shape survived.
export function measureWoff2ReconstructedOutlines(
  ttf: Readonly<Uint8Array>,
  woff2: Readonly<Uint8Array>,
): { compared: number; identical: number } | null {
  const tables = readWoff2RawTables(woff2);
  const transformed = tables?.get('glyf');
  if (transformed === undefined) return null;
  const streams = readWoff2GlyfStreams(transformed);
  if (streams === null) return null;
  const rebuilt = reverseWoff2GlyfTransform(streams);
  if (rebuilt === null) return null;

  // The reconstructed table is read back with the SAME independent reader used on the real font, so a
  // defect in the writer cannot be cancelled out by a matching defect in a bespoke reader.
  const rebuiltFont = assembleComparableFont(ttf, rebuilt.glyf, rebuilt.loca);
  if (rebuiltFont === null) return null;

  let compared = 0;
  let identical = 0;
  for (let index = 0; index < streams.glyphCount; index += 1) {
    const truth = readSfntGlyphOutline(ttf, index);
    if (truth === null) continue;
    const mine = readSfntGlyphOutline(rebuiltFont, index);
    compared += 1;
    if (mine !== null && outlinesAreIdentical(truth, mine)) identical += 1;
  }
  return { compared, identical };
}

// Rewrites a font with a replacement `glyf` and `loca`, so the reconstructed tables can be read back
// through the ordinary sfnt path rather than through a reader written specially for them.
function assembleComparableFont(
  source: Readonly<Uint8Array>,
  glyf: Readonly<Uint8Array>,
  loca: Readonly<Uint8Array>,
): Uint8Array | null {
  const directory = readSfntTableDirectory(source);
  if (directory === null) return null;
  const tables: { data: Readonly<Uint8Array>; tag: number }[] = [];
  for (const [tag, entry] of directory.tables) {
    const data =
      tag === 'glyf' ? glyf : tag === 'loca' ? loca : source.subarray(entry.offset, entry.offset + entry.length);
    tables.push({ data, tag: packSfntTag(tag) });
  }
  return assembleSfntFont(new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(0), tables);
}

// Counts which table transforms a corpus of WOFF2 files actually uses, keyed by tag.
//
// ★ THIS IS THE EVIDENCE FOR WHAT A READER MUST IMPLEMENT, AND IT IS THE DIFFERENCE BETWEEN A GAP AND
// A FALSE GAP. The container permits a transform on tables other than `glyf` and `loca`, so a reader
// that refuses them looks incomplete against the format. Whether that incompleteness is REACHABLE is a
// question about what producers emit, which only a corpus can answer — and an unreachable branch cannot
// be tested, so building one trades a real refusal for an untested code path.
//
// The denominator matters as much as the counts: a tag absent from a corpus that never exercised it is
// not evidence of anything, so callers should report `filesRead` alongside.
export function censusWoff2Transforms(files: readonly Readonly<Uint8Array>[]): {
  filesRead: number;
  transformedByTag: Map<string, number>;
} {
  const transformedByTag = new Map<string, number>();
  let filesRead = 0;
  for (const file of files) {
    const directory = readWoff2TableDirectory(file);
    if (directory === null) continue;
    filesRead += 1;
    for (const entry of directory.entries) {
      if (entry.transformed) transformedByTag.set(entry.tag, (transformedByTag.get(entry.tag) ?? 0) + 1);
    }
  }
  return { filesRead, transformedByTag };
}

// Reads every `.woff2` under a directory tree, for the census above.
export function collectWoff2Files(directory: string): Uint8Array[] {
  const files: Uint8Array[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at)) {
      const path = join(at, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.woff2')) files.push(new Uint8Array(readFileSync(path)));
    }
  };
  walk(directory);
  return files;
}

// Run directly to measure a fixture tree; imported by the tests, which must not trigger it.
if (process.argv[1]?.endsWith('woff2-reversal-oracle.ts') === true) {
  const directory = process.argv[2];
  if (directory === undefined) {
    console.log('usage: tsx scripts/woff2-reversal-oracle.ts <directory of matched .ttf/.woff2 builds>');
  } else {
    const pairs = collectWoff2ReversalPairs(directory);
    console.log(`matched pairs found: ${pairs.length}`);
    console.log(formatWoff2ReversalOracleReport(runWoff2ReversalOracle(pairs)));
    let compared = 0;
    let identical = 0;
    for (const pair of pairs) {
      const outcome = measureWoff2ReconstructedOutlines(pair.ttf, pair.woff2);
      if (outcome === null) continue;
      compared += outcome.compared;
      identical += outcome.identical;
    }
    console.log(`  RECONSTRUCTED OUTLINES identical to the paired ttf: ${identical}/${compared}`);
    const census = censusWoff2Transforms(collectWoff2Files(directory));
    console.log(`  transform census over ${census.filesRead} woff2 files:`);
    for (const [tag, count] of [...census.transformedByTag].sort()) console.log(`    transformed '${tag}': ${count}`);
  }
}
