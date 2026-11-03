// Generated from crates/flight-path-formats/src/svg_path_data.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathEllipticalArcTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  createPath,
  forEachPathSegment,
} from '@flighthq/path/contract';
import type { Path, PathSegment } from '@flighthq/path/contract';

import type { SvgPathDataExplanation, SvgPathDataFormatOptions } from './types.ts';

/**
 * The scanner over the input's UTF-16 code units, so positions are the source's string indices.
 */
interface SvgPathDataReader {
  units: number[];
  pos: number;
}

/**
 * Parses an SVG path `d` string into the end of an existing `path`, appending its contours via the
 * flight-path builders. Supports the full SVG path grammar: absolute (uppercase) and relative
 * (lowercase) `M L H V C S Q T A Z`, implicit repeated commands, and the smooth-curve shorthands
 * `S`/`T` (reflecting the previous cubic/quadratic control point). Returns `false` on structurally
 * malformed input (a leading command that is not moveto, an unknown command letter, or a
 * missing/short coordinate run); the input is parsed into a scratch path first, so a failed parse
 * leaves `path` unchanged. Returns `true` when the whole string parses. An empty or
 * whitespace-only string is well-formed and appends nothing.
 *
 * Elliptic arcs (`A`/`a`) are appended through `appendPathEllipticalArcTo`, which approximates
 * them as cubic bezier segments, so a later `forEachPathSegment` walk (and
 * `formatSvgPathData`) sees cubics, not an arc verb. The geometry round-trips; the arc command
 * does not.
 */
export function appendSvgPathData(path: Path, d: string): boolean {
  let scratch = createPath('nonZero');
  if (parseSvgPathDataInto(scratch, d) !== undefined) {
    return false;
  }
  for (let index = 0, count = scratch.commands.length; index < count; index++) {
    path.commands.push(scratch.commands[index]);
  }
  for (let index = 0, count = scratch.data.length; index < count; index++) {
    path.data.push(scratch.data[index]);
  }
  return true;
}

/**
 * Explains why an SVG path `d` string cannot be parsed: `undefined` for well-formed input, or the input
 * position (UTF-16 code-unit index) and a stable reason for malformed input.
 */
export function explainSvgPathData(d: string): SvgPathDataExplanation | undefined {
  return parseSvgPathDataInto(createPath('nonZero'), d);
}

function explanation(position: number, reason: string): SvgPathDataExplanation | undefined {
  return { position: position, reason: String(reason) };
}

function formatSvgNumber(value: number, precision?: number): string {
  if (precision === undefined) {
    return getJsNumberString(value);
  }
  const factor = Math.pow(10.0, precision);
  return getJsNumberString(roundJs(value * factor) / factor);
}

/**
 * Serializes a `Path` to an SVG path `d` string, emitting absolute commands. Each `PathSegment`
 * maps to its SVG verb: `MoveTo`→`M`, `LineTo`→`L`, `QuadraticCurveTo`→`Q`, `CubicCurveTo`→`C`,
 * `Close`→`Z`. Arcs are not a distinct segment kind (the path stores them as cubics), so no `A`
 * command is produced.
 *
 * `options.precision`, when given, rounds every coordinate to that many decimal places and drops
 * trailing zeros; the default emits full-precision numbers (also trailing-zero-free). Numbers are
 * spelled as JavaScript's `String(number)` spells them.
 */
export function formatSvgPathData(path: Readonly<Path>, options?: Readonly<SvgPathDataFormatOptions>): string {
  const precision = options?.precision;
  let parts: string[] = [] as never[];
  forEachPathSegment(path, (segment: PathSegment) =>
    (() => {
      const matchValue = segment;
      if (matchValue.kind === 'moveTo') {
        const x = matchValue.x;
        const y = matchValue.y;
        return (() => {
          parts.push(`M${formatSvgNumber(x, precision)} ${formatSvgNumber(y, precision)}`);
        })();
      } else if (matchValue.kind === 'lineTo') {
        const x = matchValue.x;
        const y = matchValue.y;
        return (() => {
          parts.push(`L${formatSvgNumber(x, precision)} ${formatSvgNumber(y, precision)}`);
        })();
      } else if (matchValue.kind === 'quadraticCurveTo') {
        const controlX = matchValue.controlX;
        const controlY = matchValue.controlY;
        const x = matchValue.x;
        const y = matchValue.y;
        return (() => {
          parts.push(
            `Q${formatSvgNumber(controlX, precision)} ${formatSvgNumber(controlY, precision)} ${formatSvgNumber(x, precision)} ${formatSvgNumber(y, precision)}`,
          );
        })();
      } else if (matchValue.kind === 'cubicCurveTo') {
        const controlX1 = matchValue.controlX1;
        const controlY1 = matchValue.controlY1;
        const controlX2 = matchValue.controlX2;
        const controlY2 = matchValue.controlY2;
        const x = matchValue.x;
        const y = matchValue.y;
        return (() => {
          parts.push(
            `C${formatSvgNumber(controlX1, precision)} ${formatSvgNumber(controlY1, precision)} ${formatSvgNumber(controlX2, precision)} ${formatSvgNumber(controlY2, precision)} ${formatSvgNumber(x, precision)} ${formatSvgNumber(y, precision)}`,
          );
        })();
      } else if (matchValue.kind === 'close') {
        return parts.push('Z');
      }
    })(),
  );
  return parts.join('');
}

function getJsNumberString(value: number): string {
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  if (value === 0.0) {
    return '0';
  }
  if (!Number.isFinite(value) && !Number.isNaN(value)) {
    return String(value > 0.0 ? 'Infinity' : '-Infinity');
  }
  const sign = value < 0.0 ? '-' : '';
  const scientific = `${Math.abs(value).toExponential()}`;
  const [mantissa, exponent] = ((value: string, delimiter: string): [string, string] | undefined => {
    const index = value.indexOf(delimiter);
    return index === -1 ? undefined : [value.slice(0, index), value.slice(index + delimiter.length)];
  })(scientific, 'e')!;
  const digits: string = [...mantissa].filter((c) => c !== '.').join('');
  const k = digits.length;
  const n =
    ((s) => {
      const v = Number(s);
      return s.trim() !== '' && Number.isInteger(v) ? v : undefined;
    })(exponent)! + 1;
  const body =
    k <= n && n <= 21
      ? `${digits}${'0'.repeat((n - k) >>> 0)}`
      : 0 < n && n <= 21
        ? `${digits.slice(0, n >>> 0)}.${digits.slice(n >>> 0)}`
        : -6 < n && n <= 0
          ? `0.${'0'.repeat(-n >>> 0)}${digits}`
          : (() => {
              const e = n - 1;
              const exponentSign = e < 0 ? '-' : '+';
              return k === 1
                ? `${digits}e${exponentSign}${Math.abs(e)}`
                : `${digits.slice(0, 1)}.${digits.slice(1)}e${exponentSign}${Math.abs(e)}`;
            })();
  return `${sign}${body}`;
}

function isAsciiLetter(unit: number): boolean {
  return (
    Array.from({ length: 90 - 65 + 1 }, (_, index) => 65 + index).includes(unit) ||
    Array.from({ length: 122 - 97 + 1 }, (_, index) => 97 + index).includes(unit)
  );
}

function isDigit(reader: Readonly<SvgPathDataReader>): boolean {
  return reader.pos < reader.units.length && reader.units[reader.pos] >= 48 && reader.units[reader.pos] <= 57;
}

function isSvgCommandLetter(unit: number): boolean {
  return Array.from({ length: 'MmLlHhVvCcSsQqTtAaZz'.length }, (_, index) =>
    'MmLlHhVvCcSsQqTtAaZz'.charCodeAt(index),
  ).some((letter) => letter === unit);
}

function isUnit(reader: Readonly<SvgPathDataReader>, a: number, b: number): boolean {
  return reader.pos < reader.units.length && (reader.units[reader.pos] === a || reader.units[reader.pos] === b);
}

/**
 * Parses an SVG path `d` string into a freshly allocated `Path`, or `undefined` on structurally
 * malformed input (see `appendSvgPathData` for the malformed cases). An empty or
 * whitespace-only string yields an empty path, not `undefined`.
 */
export function parseSvgPathData(d: string): Path | undefined {
  let path = createPath('nonZero');
  if (parseSvgPathDataInto(path, d) !== undefined) {
    return undefined;
  }
  return path;
}

function parseSvgPathDataInto(path: Path, d: string): SvgPathDataExplanation | undefined {
  let reader = { units: Array.from({ length: d.length }, (_, index) => d.charCodeAt(index)), pos: 0 };
  const length = reader.units.length;
  let currentX = 0.0;
  let currentY = 0.0;
  let startX = 0.0;
  let startY = 0.0;
  let lastControl2X = 0.0;
  let lastControl2Y = 0.0;
  let lastQuadControlX = 0.0;
  let lastQuadControlY = 0.0;
  let lastKind: number = 0;
  for (;;) {
    skipSeparators(reader);
    if (reader.pos >= length) {
      break;
    }
    const commandLetter = reader.units[reader.pos];
    if (!isSvgCommandLetter(commandLetter)) {
      return explanation(reader.pos, 'expected-command');
    }
    reader.pos += 1;
    if (lastKind === 0 && commandLetter !== 77 && commandLetter !== 109) {
      return explanation(reader.pos - 1, 'expected-moveto');
    }
    if (commandLetter === 90 || commandLetter === 122) {
      appendPathClose(path);
      currentX = startX;
      currentY = startY;
      lastKind = 90;
      continue;
    }
    let active = commandLetter & 0xff;
    let first = true;
    for (;;) {
      if (!first) {
        skipSeparators(reader);
        if (reader.pos >= length) {
          break;
        }
        if (isAsciiLetter(reader.units[reader.pos])) {
          break;
        }
      }
      const relative = active >= 97;
      const upper = relative && active <= 122 ? active - (97 - 65) : active;
      if (upper === 77) {
        let nx = readNumber(reader);
        let ny = readNumber(reader);
        const $t0 = nx;
        const $t1 = ny;
        if ($t0 === undefined || $t1 === undefined) {
          return explanation(reader.pos, 'expected-coordinate-pair');
        }
        nx = $t0;
        ny = $t1;
        currentX = relative ? currentX + nx : nx;
        currentY = relative ? currentY + ny : ny;
        startX = currentX;
        startY = currentY;
        appendPathMoveTo(path, currentX, currentY);
        lastKind = 77;
      } else {
        if (upper === 76) {
          let nx = readNumber(reader);
          let ny = readNumber(reader);
          const $t0 = nx;
          const $t1 = ny;
          if ($t0 === undefined || $t1 === undefined) {
            return explanation(reader.pos, 'expected-coordinate-pair');
          }
          nx = $t0;
          ny = $t1;
          currentX = relative ? currentX + nx : nx;
          currentY = relative ? currentY + ny : ny;
          appendPathLineTo(path, currentX, currentY);
          lastKind = 76;
        } else {
          if (upper === 72) {
            const nx = readNumber(reader);
            if (nx === undefined) {
              return explanation(reader.pos, 'expected-coordinate');
            }
            currentX = relative ? currentX + nx : nx;
            appendPathLineTo(path, currentX, currentY);
            lastKind = 76;
          } else {
            if (upper === 86) {
              const ny = readNumber(reader);
              if (ny === undefined) {
                return explanation(reader.pos, 'expected-coordinate');
              }
              currentY = relative ? currentY + ny : ny;
              appendPathLineTo(path, currentX, currentY);
              lastKind = 76;
            } else {
              if (upper === 67) {
                let x1 = readNumber(reader);
                let y1 = readNumber(reader);
                let x2 = readNumber(reader);
                let y2 = readNumber(reader);
                let x = readNumber(reader);
                let y = readNumber(reader);
                const $t0 = x1;
                const $t1 = y1;
                const $t2 = x2;
                const $t3 = y2;
                const $t4 = x;
                const $t5 = y;
                if (
                  $t0 === undefined ||
                  $t1 === undefined ||
                  $t2 === undefined ||
                  $t3 === undefined ||
                  $t4 === undefined ||
                  $t5 === undefined
                ) {
                  return explanation(reader.pos, 'expected-cubic-coordinates');
                }
                x1 = $t0;
                y1 = $t1;
                x2 = $t2;
                y2 = $t3;
                x = $t4;
                y = $t5;
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
                lastKind = 67;
              } else {
                if (upper === 83) {
                  let x2 = readNumber(reader);
                  let y2 = readNumber(reader);
                  let x = readNumber(reader);
                  let y = readNumber(reader);
                  const $t0 = x2;
                  const $t1 = y2;
                  const $t2 = x;
                  const $t3 = y;
                  if ($t0 === undefined || $t1 === undefined || $t2 === undefined || $t3 === undefined) {
                    return explanation(reader.pos, 'expected-smooth-cubic-coordinates');
                  }
                  x2 = $t0;
                  y2 = $t1;
                  x = $t2;
                  y = $t3;
                  const reflect = lastKind === 67 || lastKind === 83;
                  const c1x = reflect ? 2.0 * currentX - lastControl2X : currentX;
                  const c1y = reflect ? 2.0 * currentY - lastControl2Y : currentY;
                  const c2x = relative ? currentX + x2 : x2;
                  const c2y = relative ? currentY + y2 : y2;
                  const ax = relative ? currentX + x : x;
                  const ay = relative ? currentY + y : y;
                  appendPathCubicCurveTo(path, c1x, c1y, c2x, c2y, ax, ay);
                  lastControl2X = c2x;
                  lastControl2Y = c2y;
                  currentX = ax;
                  currentY = ay;
                  lastKind = 83;
                } else {
                  if (upper === 81) {
                    let x1 = readNumber(reader);
                    let y1 = readNumber(reader);
                    let x = readNumber(reader);
                    let y = readNumber(reader);
                    const $t0 = x1;
                    const $t1 = y1;
                    const $t2 = x;
                    const $t3 = y;
                    if ($t0 === undefined || $t1 === undefined || $t2 === undefined || $t3 === undefined) {
                      return explanation(reader.pos, 'expected-quadratic-coordinates');
                    }
                    x1 = $t0;
                    y1 = $t1;
                    x = $t2;
                    y = $t3;
                    const cx = relative ? currentX + x1 : x1;
                    const cy = relative ? currentY + y1 : y1;
                    const ax = relative ? currentX + x : x;
                    const ay = relative ? currentY + y : y;
                    appendPathQuadraticCurveTo(path, cx, cy, ax, ay);
                    lastQuadControlX = cx;
                    lastQuadControlY = cy;
                    currentX = ax;
                    currentY = ay;
                    lastKind = 81;
                  } else {
                    if (upper === 84) {
                      let x = readNumber(reader);
                      let y = readNumber(reader);
                      const $t0 = x;
                      const $t1 = y;
                      if ($t0 === undefined || $t1 === undefined) {
                        return explanation(reader.pos, 'expected-coordinate-pair');
                      }
                      x = $t0;
                      y = $t1;
                      const reflect = lastKind === 81 || lastKind === 84;
                      const cx = reflect ? 2.0 * currentX - lastQuadControlX : currentX;
                      const cy = reflect ? 2.0 * currentY - lastQuadControlY : currentY;
                      const ax = relative ? currentX + x : x;
                      const ay = relative ? currentY + y : y;
                      appendPathQuadraticCurveTo(path, cx, cy, ax, ay);
                      lastQuadControlX = cx;
                      lastQuadControlY = cy;
                      currentX = ax;
                      currentY = ay;
                      lastKind = 84;
                    } else {
                      if (upper === 65) {
                        let rx = readNumber(reader);
                        let ry = readNumber(reader);
                        let rotationDegrees = readNumber(reader);
                        let largeArc = readFlag(reader);
                        let sweep = readFlag(reader);
                        let x = readNumber(reader);
                        let y = readNumber(reader);
                        const $t0 = rx;
                        const $t1 = ry;
                        const $t2 = rotationDegrees;
                        const $t3 = largeArc;
                        const $t4 = sweep;
                        const $t5 = x;
                        const $t6 = y;
                        if (
                          $t0 === undefined ||
                          $t1 === undefined ||
                          $t2 === undefined ||
                          $t3 === undefined ||
                          $t4 === undefined ||
                          $t5 === undefined ||
                          $t6 === undefined
                        ) {
                          return explanation(reader.pos, 'expected-arc-parameters');
                        }
                        rx = $t0;
                        ry = $t1;
                        rotationDegrees = $t2;
                        largeArc = $t3;
                        sweep = $t4;
                        x = $t5;
                        y = $t6;
                        const ax = relative ? currentX + x : x;
                        const ay = relative ? currentY + y : y;
                        if (lastKind === 90) {
                          appendPathMoveTo(path, currentX, currentY);
                        }
                        appendPathEllipticalArcTo(
                          path,
                          rx,
                          ry,
                          (rotationDegrees * Math.PI) / 180.0,
                          largeArc,
                          sweep,
                          ax,
                          ay,
                        );
                        currentX = ax;
                        currentY = ay;
                        lastKind = 65;
                      } else {
                        return explanation(reader.pos - 1, 'unsupported-command');
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      first = false;
      if (active === 77) {
        active = 76;
      } else {
        if (active === 109) {
          active = 108;
        }
      }
    }
  }
  return undefined;
}

function readFlag(reader: SvgPathDataReader): boolean | undefined {
  skipSeparators(reader);
  if (isUnit(reader, 48, 48)) {
    reader.pos += 1;
    return false;
  }
  if (isUnit(reader, 49, 49)) {
    reader.pos += 1;
    return true;
  }
  return undefined;
}

function readNumber(reader: SvgPathDataReader): number | undefined {
  skipSeparators(reader);
  const start = reader.pos;
  if (isUnit(reader, 43, 45)) {
    reader.pos += 1;
  }
  let sawDigit = false;
  while (isDigit(reader)) {
    reader.pos += 1;
    sawDigit = true;
  }
  if (isUnit(reader, 46, 46)) {
    reader.pos += 1;
    while (isDigit(reader)) {
      reader.pos += 1;
      sawDigit = true;
    }
  }
  if (!sawDigit) {
    reader.pos = start;
    return undefined;
  }
  if (isUnit(reader, 101, 69)) {
    const expStart = reader.pos;
    reader.pos += 1;
    if (isUnit(reader, 43, 45)) {
      reader.pos += 1;
    }
    let expDigit = false;
    while (isDigit(reader)) {
      reader.pos += 1;
      expDigit = true;
    }
    if (!expDigit) {
      reader.pos = expStart;
    }
  }
  const token = ((units: Readonly<number[]>): string => {
    let value = '';
    for (let index = 0; index < units.length; index += 0x8000)
      value += String.fromCharCode(...units.slice(index, index + 0x8000));
    return value;
  })(reader.units.slice(start, reader.pos));
  const value = ((s) => {
    const v = Number(s);
    return s.trim() !== '' && !Number.isNaN(v) ? v : undefined;
  })(token);
  if (value === undefined) {
    return undefined;
  }
  return Number.isFinite(value) ? value : undefined;
}

function roundJs(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const floor = Math.floor(value);
  const rounded = value - floor >= 0.5 ? floor + 1.0 : floor;
  return rounded === 0.0 && value < 0.0 ? -0.0 : rounded;
}

function skipSeparators(reader: SvgPathDataReader): void {
  while (reader.pos < reader.units.length) {
    {
      const matchValue = reader.units[reader.pos];
      if (
        matchValue === 32 ||
        matchValue === 9 ||
        matchValue === 10 ||
        matchValue === 13 ||
        matchValue === 12 ||
        matchValue === 44
      ) {
        reader.pos += 1;
      } else {
        break;
      }
    }
  }
}
