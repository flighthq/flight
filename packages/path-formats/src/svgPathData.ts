import {
  appendPathArcTo,
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  createPath,
  forEachPathSegment,
} from '@flighthq/path';
import type { Path } from '@flighthq/types';

/**
 * Parses an SVG path `d` string into the end of an existing `path`, appending its contours via the
 * `@flighthq/path` builders. Supports the full SVG path grammar: absolute (uppercase) and relative
 * (lowercase) `M L H V C S Q T A Z`, implicit repeated commands, and the smooth-curve shorthands
 * `S`/`T` (reflecting the previous cubic/quadratic control point). Returns `false` without further
 * mutation guarantee on structurally malformed input (a leading command that is not moveto, an
 * unknown command letter, or a missing/short coordinate run); returns `true` when the whole string
 * parses. An empty or whitespace-only string is well-formed and appends nothing.
 *
 * Elliptic arcs (`A`/`a`) are appended through `appendPathArcTo`, which approximates them as cubic
 * bezier segments — a subsequent `forEachPathSegment` walk (and `formatSvgPathData`) therefore sees
 * cubics, not an arc verb. The geometry round-trips; the arc command does not.
 */
export function appendSvgPathData(path: Path, d: string): boolean {
  const length = d.length;
  let pos = 0;

  // Current point, subpath start (for Z), and the last emitted control points in absolute space.
  // `lastControl2` feeds `S` reflection (valid only after C/S); `lastQuadControl` feeds `T`
  // reflection (valid only after Q/T). `lastKind` records the previous group's canonical letter so
  // a shorthand can decide whether reflection applies.
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let lastControl2X = 0;
  let lastControl2Y = 0;
  let lastQuadControlX = 0;
  let lastQuadControlY = 0;
  let lastKind = '';

  function skipSeparators(): void {
    while (pos < length) {
      const c = d.charCodeAt(pos);
      // space, tab, LF, CR, FF, or comma
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 44) pos++;
      else break;
    }
  }

  function readNumber(): number | null {
    skipSeparators();
    const start = pos;
    if (pos < length && (d[pos] === '+' || d[pos] === '-')) pos++;
    let sawDigit = false;
    while (pos < length && d[pos] >= '0' && d[pos] <= '9') {
      pos++;
      sawDigit = true;
    }
    if (pos < length && d[pos] === '.') {
      pos++;
      while (pos < length && d[pos] >= '0' && d[pos] <= '9') {
        pos++;
        sawDigit = true;
      }
    }
    if (!sawDigit) {
      pos = start;
      return null;
    }
    if (pos < length && (d[pos] === 'e' || d[pos] === 'E')) {
      const expStart = pos;
      pos++;
      if (pos < length && (d[pos] === '+' || d[pos] === '-')) pos++;
      let expDigit = false;
      while (pos < length && d[pos] >= '0' && d[pos] <= '9') {
        pos++;
        expDigit = true;
      }
      if (!expDigit) pos = expStart;
    }
    return Number.parseFloat(d.slice(start, pos));
  }

  // An arc flag is a single '0' or '1' character, which may be packed against neighbours with no
  // separator (`0110` = four flags), so it is read one char at a time rather than as a number.
  function readFlag(): number | null {
    skipSeparators();
    if (pos < length && d[pos] === '0') {
      pos++;
      return 0;
    }
    if (pos < length && d[pos] === '1') {
      pos++;
      return 1;
    }
    return null;
  }

  while (true) {
    skipSeparators();
    if (pos >= length) break;

    const commandLetter = d[pos];
    if (!isSvgCommandLetter(commandLetter)) return false;
    pos++;

    // Path data must open with a moveto.
    if (lastKind === '' && commandLetter !== 'M' && commandLetter !== 'm') return false;

    if (commandLetter === 'Z' || commandLetter === 'z') {
      appendPathClose(path);
      currentX = startX;
      currentY = startY;
      lastKind = 'Z';
      continue;
    }

    // Execute one or more operand groups. After the first `M`/`m` group, implicit repeats are
    // lineto groups (SVG spec), so the active letter shifts from M→L (or m→l).
    let active = commandLetter;
    let first = true;
    while (true) {
      if (!first) {
        skipSeparators();
        if (pos >= length) break;
        if (isSvgCommandLetter(d[pos])) break;
      }

      const relative = active >= 'a';
      const upper = relative ? active.toUpperCase() : active;

      if (upper === 'M') {
        const nx = readNumber();
        const ny = readNumber();
        if (nx === null || ny === null) return false;
        currentX = relative ? currentX + nx : nx;
        currentY = relative ? currentY + ny : ny;
        startX = currentX;
        startY = currentY;
        appendPathMoveTo(path, currentX, currentY);
        lastKind = 'M';
      } else if (upper === 'L') {
        const nx = readNumber();
        const ny = readNumber();
        if (nx === null || ny === null) return false;
        currentX = relative ? currentX + nx : nx;
        currentY = relative ? currentY + ny : ny;
        appendPathLineTo(path, currentX, currentY);
        lastKind = 'L';
      } else if (upper === 'H') {
        const nx = readNumber();
        if (nx === null) return false;
        currentX = relative ? currentX + nx : nx;
        appendPathLineTo(path, currentX, currentY);
        lastKind = 'L';
      } else if (upper === 'V') {
        const ny = readNumber();
        if (ny === null) return false;
        currentY = relative ? currentY + ny : ny;
        appendPathLineTo(path, currentX, currentY);
        lastKind = 'L';
      } else if (upper === 'C') {
        const x1 = readNumber();
        const y1 = readNumber();
        const x2 = readNumber();
        const y2 = readNumber();
        const x = readNumber();
        const y = readNumber();
        if (x1 === null || y1 === null || x2 === null || y2 === null || x === null || y === null) return false;
        const c1x = relative ? currentX + x1 : x1;
        const c1y = relative ? currentY + y1 : y1;
        const c2x = relative ? currentX + x2 : x2;
        const c2y = relative ? currentY + y2 : y2;
        const ax = relative ? currentX + x : x;
        const ay = relative ? currentY + y : y;
        appendPathCubicCurveTo(path, c1x, c1y, c2x, c2y, ax, ay);
        lastControl2X = c2x;
        lastControl2Y = c2y;
        currentX = ax;
        currentY = ay;
        lastKind = 'C';
      } else if (upper === 'S') {
        const x2 = readNumber();
        const y2 = readNumber();
        const x = readNumber();
        const y = readNumber();
        if (x2 === null || y2 === null || x === null || y === null) return false;
        const reflect = lastKind === 'C' || lastKind === 'S';
        const c1x = reflect ? 2 * currentX - lastControl2X : currentX;
        const c1y = reflect ? 2 * currentY - lastControl2Y : currentY;
        const c2x = relative ? currentX + x2 : x2;
        const c2y = relative ? currentY + y2 : y2;
        const ax = relative ? currentX + x : x;
        const ay = relative ? currentY + y : y;
        appendPathCubicCurveTo(path, c1x, c1y, c2x, c2y, ax, ay);
        lastControl2X = c2x;
        lastControl2Y = c2y;
        currentX = ax;
        currentY = ay;
        lastKind = 'S';
      } else if (upper === 'Q') {
        const x1 = readNumber();
        const y1 = readNumber();
        const x = readNumber();
        const y = readNumber();
        if (x1 === null || y1 === null || x === null || y === null) return false;
        const cx = relative ? currentX + x1 : x1;
        const cy = relative ? currentY + y1 : y1;
        const ax = relative ? currentX + x : x;
        const ay = relative ? currentY + y : y;
        appendPathCurveTo(path, cx, cy, ax, ay);
        lastQuadControlX = cx;
        lastQuadControlY = cy;
        currentX = ax;
        currentY = ay;
        lastKind = 'Q';
      } else if (upper === 'T') {
        const x = readNumber();
        const y = readNumber();
        if (x === null || y === null) return false;
        const reflect = lastKind === 'Q' || lastKind === 'T';
        const cx = reflect ? 2 * currentX - lastQuadControlX : currentX;
        const cy = reflect ? 2 * currentY - lastQuadControlY : currentY;
        const ax = relative ? currentX + x : x;
        const ay = relative ? currentY + y : y;
        appendPathCurveTo(path, cx, cy, ax, ay);
        lastQuadControlX = cx;
        lastQuadControlY = cy;
        currentX = ax;
        currentY = ay;
        lastKind = 'T';
      } else if (upper === 'A') {
        const rx = readNumber();
        const ry = readNumber();
        const rotationDegrees = readNumber();
        const largeArc = readFlag();
        const sweep = readFlag();
        const x = readNumber();
        const y = readNumber();
        if (
          rx === null ||
          ry === null ||
          rotationDegrees === null ||
          largeArc === null ||
          sweep === null ||
          x === null ||
          y === null
        ) {
          return false;
        }
        const ax = relative ? currentX + x : x;
        const ay = relative ? currentY + y : y;
        appendPathArcTo(path, rx, ry, (rotationDegrees * Math.PI) / 180, largeArc === 1, sweep === 1, ax, ay);
        currentX = ax;
        currentY = ay;
        lastKind = 'A';
      } else {
        return false;
      }

      first = false;
      if (active === 'M') active = 'L';
      else if (active === 'm') active = 'l';
    }
  }

  return true;
}

/**
 * Serializes a `Path` to an SVG path `d` string, emitting absolute commands. Each `PathSegment`
 * maps to its SVG verb: `moveTo`→`M`, `lineTo`→`L`, `curveTo` (quadratic)→`Q`, `cubicCurveTo`→`C`,
 * `close`→`Z`. Arcs are not a distinct segment kind — the path stores them as cubics — so no `A`
 * command is produced.
 *
 * `options.precision`, when given, rounds every coordinate to that many decimal places and drops
 * trailing zeros; the default emits full-precision numbers (also trailing-zero-free).
 */
export function formatSvgPathData(path: Readonly<Path>, options?: Readonly<{ precision?: number }>): string {
  const precision = options?.precision;
  const parts: string[] = [];
  forEachPathSegment(path, (segment) => {
    if (segment.kind === 'moveTo') {
      parts.push(`M${formatSvgNumber(segment.x, precision)} ${formatSvgNumber(segment.y, precision)}`);
    } else if (segment.kind === 'lineTo') {
      parts.push(`L${formatSvgNumber(segment.x, precision)} ${formatSvgNumber(segment.y, precision)}`);
    } else if (segment.kind === 'curveTo') {
      parts.push(
        `Q${formatSvgNumber(segment.controlX, precision)} ${formatSvgNumber(segment.controlY, precision)} ` +
          `${formatSvgNumber(segment.x, precision)} ${formatSvgNumber(segment.y, precision)}`,
      );
    } else if (segment.kind === 'cubicCurveTo') {
      parts.push(
        `C${formatSvgNumber(segment.control1X, precision)} ${formatSvgNumber(segment.control1Y, precision)} ` +
          `${formatSvgNumber(segment.control2X, precision)} ${formatSvgNumber(segment.control2Y, precision)} ` +
          `${formatSvgNumber(segment.x, precision)} ${formatSvgNumber(segment.y, precision)}`,
      );
    } else if (segment.kind === 'close') {
      parts.push('Z');
    }
  });
  return parts.join('');
}

/**
 * Parses an SVG path `d` string into a freshly allocated `Path`, or returns `null` on structurally
 * malformed input (see `appendSvgPathData` for the malformed cases). An empty or whitespace-only
 * string yields an empty path, not `null`.
 */
export function parseSvgPathData(d: string): Path | null {
  const path = createPath();
  if (!appendSvgPathData(path, d)) return null;
  return path;
}

function formatSvgNumber(value: number, precision?: number): string {
  if (precision === undefined) return String(value);
  const factor = 10 ** precision;
  // String() of the rounded number drops trailing zeros and normalizes -0 to "0".
  return String(Math.round(value * factor) / factor);
}

function isSvgCommandLetter(c: string): boolean {
  return 'MmLlHhVvCcSsQqTtAaZz'.indexOf(c) !== -1;
}
