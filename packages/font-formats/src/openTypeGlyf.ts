import type { Path, SfntTableDirectory } from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';

// TrueType outlines: `loca` gives each glyph's byte range inside `glyf`, and a glyph is a set of closed
// contours of points, each point flagged on-curve or off-curve.
//
// THE ONE THING THAT MAKES THIS FORMAT DIFFERENT FROM EVERY OTHER PATH FORMAT: consecutive off-curve
// points imply an on-curve point exactly halfway between them. The format omits those midpoints because
// they are recoverable, so a reader that treats the point list literally produces contours that visibly
// cut corners. They are reconstructed below.
//
// Coordinates are design units, y-up in the font's own convention. `Path` is y-down, so y is negated at
// this seam — once, here — which is what makes the produced outlines match `GlyphOutlineMetrics`'
// documented "ink above the baseline has negative y".

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME_OR_POSITIVE = 0x10;
const Y_SAME_OR_POSITIVE = 0x20;

// Replaces `out` with one glyph's contours. Returns false for a glyph whose data is unreadable; returns
// true with an empty path for a glyph that legitimately has no outline.
//
// Composite glyphs — an accented letter assembled from a base and a mark — are NOT expanded. They are
// reported as an empty outline rather than as a failure, because the glyph exists and its advance is
// still correct; only its ink is missing. Expanding them needs component transforms and is a deliberate
// follow-up rather than something to half-do inside the simple-glyph reader.
export function readOpenTypeGlyphOutline(
  out: Path,
  bytes: Readonly<Uint8Array>,
  directory: Readonly<SfntTableDirectory>,
  ranges: Readonly<Uint32Array>,
  glyphIndex: number,
): boolean {
  const glyf = directory.tables.get('glyf');
  if (glyf === undefined || glyphIndex < 0 || glyphIndex + 1 >= ranges.length) return false;

  out.commands.length = 0;
  out.data.length = 0;
  // `out` is REPLACED, so every field it owns is written — including this one. Both outline
  // flavors fill by the nonzero rule, and a caller reusing a scratch path would otherwise keep
  // whatever winding the previous glyph left, which turns a counter into a solid blob.
  out.winding = 'nonZero';

  const start = glyf.offset + ranges[glyphIndex]!;
  const end = glyf.offset + ranges[glyphIndex + 1]!;
  // An empty range is a glyph with no ink. True, not false: the caller still needs its advance.
  if (end <= start) return true;
  if (end > bytes.byteLength || start + 10 > bytes.byteLength) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const contourCount = view.getInt16(start);
  // Negative means composite. Empty outline, advance preserved — see above.
  if (contourCount <= 0) return true;

  const endPoints = new Uint16Array(contourCount);
  let cursor = start + 10;
  if (cursor + contourCount * 2 + 2 > bytes.byteLength) return false;
  for (let contour = 0; contour < contourCount; contour += 1) {
    endPoints[contour] = view.getUint16(cursor);
    cursor += 2;
  }

  const pointCount = endPoints[contourCount - 1]! + 1;
  // Skip the hinting program: this package produces unhinted design-unit outlines by charter.
  cursor += 2 + view.getUint16(cursor);

  const flags = readGlyfFlags(view, cursor, pointCount, bytes.byteLength);
  if (flags === null) return false;
  cursor = flags.cursor;

  const xs = readGlyfCoordinates(view, cursor, flags.flags, X_SHORT, X_SAME_OR_POSITIVE, bytes.byteLength);
  if (xs === null) return false;
  const ys = readGlyfCoordinates(view, xs.cursor, flags.flags, Y_SHORT, Y_SAME_OR_POSITIVE, bytes.byteLength);
  if (ys === null) return false;

  let first = 0;
  for (let contour = 0; contour < contourCount; contour += 1) {
    const last = endPoints[contour]!;
    if (last >= pointCount) return false;
    appendGlyfContour(out, flags.flags, xs.values, ys.values, first, last);
    first = last + 1;
  }
  return true;
}

// Byte ranges of every glyph, indexed by glyph id, with one extra trailing entry so glyph `n` spans
// `[offsets[n], offsets[n + 1])`. An empty span is a real and common answer — a space has no outline —
// and is preserved rather than dropped, because the glyph still exists and still advances.
export function readOpenTypeGlyphRanges(
  bytes: Readonly<Uint8Array>,
  directory: Readonly<SfntTableDirectory>,
  glyphCount: number,
  locaFormat: number,
): Uint32Array | null {
  const loca = directory.tables.get('loca');
  if (loca === undefined) return null;

  const entryCount = glyphCount + 1;
  const entryBytes = locaFormat === 0 ? 2 : 4;
  if (entryCount * entryBytes > loca.length) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offsets = new Uint32Array(entryCount);
  for (let index = 0; index < entryCount; index += 1) {
    // The short form stores HALVED offsets, which is the whole reason the format flag exists.
    offsets[index] =
      locaFormat === 0 ? view.getUint16(loca.offset + index * 2) * 2 : view.getUint32(loca.offset + index * 4);
  }
  return offsets;
}

// One closed contour, with the implied on-curve midpoints reconstructed.
//
// The contour may begin on an off-curve point, in which case the true start is either the last point
// (if that one is on-curve) or the midpoint between the two. Getting this wrong rotates the whole
// contour by one point and is invisible on a circle while obvious on a letter.
function appendGlyfContour(
  out: Path,
  flags: Readonly<Uint8Array>,
  xs: Readonly<Int32Array>,
  ys: Readonly<Int32Array>,
  first: number,
  last: number,
): void {
  const count = last - first + 1;
  if (count <= 0) return;

  const onCurve = (index: number): boolean => (flags[first + (((index % count) + count) % count)]! & ON_CURVE) !== 0;
  const pointX = (index: number): number => xs[first + (((index % count) + count) % count)]!;
  // y is negated here — the single place the font's y-up convention becomes `Path`'s y-down.
  const pointY = (index: number): number => -ys[first + (((index % count) + count) % count)]!;

  let startX: number;
  let startY: number;
  let startIndex: number;
  // How many points remain to be traversed after the start. When the start IS one of the contour's
  // points, that point must not be walked again — traversing all `count` would emit a zero-length
  // segment back onto the start that `CLOSE` already implies. Only the synthesized-midpoint start,
  // which is not a point of the contour, leaves all `count` still to visit.
  let stepCount: number;
  if (onCurve(0)) {
    startX = pointX(0);
    startY = pointY(0);
    startIndex = 1;
    stepCount = count - 1;
  } else if (onCurve(count - 1)) {
    startX = pointX(count - 1);
    startY = pointY(count - 1);
    startIndex = 0;
    stepCount = count - 1;
  } else {
    startX = (pointX(0) + pointX(count - 1)) / 2;
    startY = (pointY(0) + pointY(count - 1)) / 2;
    startIndex = 0;
    stepCount = count;
  }

  out.commands.push(PathCommand.MOVE_TO);
  out.data.push(startX, startY);

  let controlX = 0;
  let controlY = 0;
  let hasControl = false;

  for (let step = 0; step < stepCount; step += 1) {
    const index = startIndex + step;
    const x = pointX(index);
    const y = pointY(index);

    if (onCurve(index)) {
      if (hasControl) {
        out.commands.push(PathCommand.CURVE_TO);
        out.data.push(controlX, controlY, x, y);
        hasControl = false;
      } else {
        out.commands.push(PathCommand.LINE_TO);
        out.data.push(x, y);
      }
      continue;
    }

    // Two off-curve points in a row: the on-curve point between them was omitted because it is exactly
    // their midpoint. Emit it, then carry this point as the next control.
    if (hasControl) {
      out.commands.push(PathCommand.CURVE_TO);
      out.data.push(controlX, controlY, (controlX + x) / 2, (controlY + y) / 2);
    }
    controlX = x;
    controlY = y;
    hasControl = true;
  }

  // Close back onto the start, through a trailing control point when the contour ended off-curve.
  if (hasControl) {
    out.commands.push(PathCommand.CURVE_TO);
    out.data.push(controlX, controlY, startX, startY);
  }
  out.commands.push(PathCommand.CLOSE);
}

// Flags are run-length encoded: a flag with REPEAT set is followed by a count of additional points
// carrying the same flag. Reading them as one byte per point desynchronizes every coordinate after the
// first repeat, which is why this is expanded before any coordinate is touched.
function readGlyfFlags(
  view: Readonly<DataView>,
  start: number,
  pointCount: number,
  byteLength: number,
): { cursor: number; flags: Uint8Array } | null {
  const flags = new Uint8Array(pointCount);
  let cursor = start;
  for (let point = 0; point < pointCount; ) {
    if (cursor >= byteLength) return null;
    const flag = view.getUint8(cursor);
    cursor += 1;
    flags[point] = flag;
    point += 1;

    if ((flag & REPEAT) === 0) continue;
    if (cursor >= byteLength) return null;
    let repeats = view.getUint8(cursor);
    cursor += 1;
    while (repeats > 0 && point < pointCount) {
      flags[point] = flag;
      point += 1;
      repeats -= 1;
    }
  }
  return { cursor, flags };
}

// Coordinates are stored as DELTAS, in one of three widths chosen per point by two flag bits: one byte
// with the sign carried by the second bit, two bytes signed, or omitted entirely to mean "unchanged
// from the previous point". Accumulated into absolute values here.
function readGlyfCoordinates(
  view: Readonly<DataView>,
  start: number,
  flags: Readonly<Uint8Array>,
  shortBit: number,
  sameOrPositiveBit: number,
  byteLength: number,
): { cursor: number; values: Int32Array } | null {
  const values = new Int32Array(flags.length);
  let cursor = start;
  let value = 0;

  for (let point = 0; point < flags.length; point += 1) {
    const flag = flags[point]!;
    if ((flag & shortBit) !== 0) {
      if (cursor >= byteLength) return null;
      const magnitude = view.getUint8(cursor);
      cursor += 1;
      value += (flag & sameOrPositiveBit) !== 0 ? magnitude : -magnitude;
    } else if ((flag & sameOrPositiveBit) === 0) {
      if (cursor + 2 > byteLength) return null;
      value += view.getInt16(cursor);
      cursor += 2;
    }
    values[point] = value;
  }
  return { cursor, values };
}
