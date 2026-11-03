// Generated from crates/flight-path-formats/tests/svg_path_data_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { PathCommand, createPath, forEachPathSegment } from '@flighthq/path/contract';
import type { Path, PathSegment } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { appendSvgPathData, explainSvgPathData, formatSvgPathData, parseSvgPathData } from './contract.ts';
import type { SvgPathDataExplanation, SvgPathDataFormatOptions } from './contract.ts';

function collectSegments(path: Readonly<Path>): PathSegment[] {
  let segments: PathSegment[] = [] as never[];
  forEachPathSegment(path, (segment: PathSegment) => segments.push(segment));
  return segments;
}

function kinds(segments: Readonly<PathSegment[]>): string[] {
  return segments.map((segment) =>
    (() => {
      const matchValue = segment;
      if (matchValue.kind === 'moveTo') {
        return 'moveTo';
      } else if (matchValue.kind === 'lineTo') {
        return 'lineTo';
      } else if (matchValue.kind === 'quadraticCurveTo') {
        return 'quadraticCurveTo';
      } else if (matchValue.kind === 'cubicCurveTo') {
        return 'cubicCurveTo';
      } else if (matchValue.kind === 'close') {
        return 'close';
      }
    })(),
  );
}

function values(segment: Readonly<PathSegment>): number[] {
  return (() => {
    const matchValue = segment;
    if (matchValue.kind === 'moveTo' || matchValue.kind === 'lineTo') {
      const x = matchValue.x;
      const y = matchValue.y;
      return [x, y];
    } else if (matchValue.kind === 'quadraticCurveTo') {
      const controlX = matchValue.controlX;
      const controlY = matchValue.controlY;
      const x = matchValue.x;
      const y = matchValue.y;
      return [controlX, controlY, x, y];
    } else if (matchValue.kind === 'cubicCurveTo') {
      const controlX1 = matchValue.controlX1;
      const controlY1 = matchValue.controlY1;
      const controlX2 = matchValue.controlX2;
      const controlY2 = matchValue.controlY2;
      const x = matchValue.x;
      const y = matchValue.y;
      return [controlX1, controlY1, controlX2, controlY2, x, y];
    } else if (matchValue.kind === 'close') {
      return [];
    }
  })();
}

function lastPoint(segments: Readonly<PathSegment[]>): readonly [number, number] {
  const $letElse = segments[segments.length - 1];
  if (!($letElse.kind === 'cubicCurveTo')) {
    throw new Error(`expected a trailing cubic`);
  }
  const x = $letElse.x;
  const y = $letElse.y;
  return [x, y];
}

function precision(value: number | undefined): SvgPathDataFormatOptions {
  return { precision: value };
}

function explained(position: number, reason: string): SvgPathDataExplanation | undefined {
  return { position: position, reason: String(reason) };
}

function parsed(d: string): PathSegment[] {
  return collectSegments(
    (() => {
      const value = parseSvgPathData(d);
      if (value === undefined) throw new Error('well-formed');
      return value;
    })(),
  );
}

describe('appendSvgPathData', () => {
  it('appends into an existing path without clearing it', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M0 0 L10 0');
    const ok = appendSvgPathData(path, 'M20 20 L30 20');
    expect(ok).toBe(true);
    expect(kinds(collectSegments(path))).toEqual(['moveTo', 'lineTo', 'moveTo', 'lineTo']);
  });
  it('returns false on malformed input', () => {
    let path = createPath('nonZero');
    expect(!appendSvgPathData(path, 'L10 10')).toBe(true);
  });
  it('does not partially mutate the destination on malformed input', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M1 2 L3 4');
    const commands = path.commands;
    const data = path.data;
    expect(!appendSvgPathData(path, 'M10 20 L30')).toBe(true);
    expect(path.commands).toEqual(commands);
    expect(path.data).toEqual(data);
  });
  it('appends nothing for empty input', () => {
    let path = createPath('nonZero');
    expect(appendSvgPathData(path, ' \t,')).toBe(true);
    expect(path.commands.length === 0 && path.data.length === 0).toBe(true);
  });
});

describe('explainSvgPathData', () => {
  it('returns null for valid input and locates malformed input', () => {
    expect(explainSvgPathData('M0 0 L1 1')).toEqual(undefined);
    expect(explainSvgPathData('L10 10')).toEqual(explained(0, 'expected-moveto'));
    expect(explainSvgPathData('M0 0 X10 10')).toEqual(explained(5, 'expected-command'));
  });
  it('reports utf16 code unit positions', () => {
    expect(explainSvgPathData('M0 0Z😀')).toEqual(explained(5, 'expected-command'));
    expect(explainSvgPathData('😀')).toEqual(explained(0, 'expected-command'));
    expect(explainSvgPathData('M0 0 é')).toEqual(explained(5, 'expected-coordinate-pair'));
  });
  it('reports each stable reason at the source position', () => {
    expect(explainSvgPathData('M0 0 L10')).toEqual(explained(8, 'expected-coordinate-pair'));
    expect(explainSvgPathData('M')).toEqual(explained(1, 'expected-coordinate-pair'));
    expect(explainSvgPathData('M0 0 H')).toEqual(explained(6, 'expected-coordinate'));
    expect(explainSvgPathData('M0 0 C1 2 3 4 5')).toEqual(explained(15, 'expected-cubic-coordinates'));
    expect(explainSvgPathData('M0 0 S1 2 3')).toEqual(explained(11, 'expected-smooth-cubic-coordinates'));
    expect(explainSvgPathData('M0 0 Q1 2 3')).toEqual(explained(11, 'expected-quadratic-coordinates'));
    expect(explainSvgPathData('M0 0 T1')).toEqual(explained(7, 'expected-coordinate-pair'));
    expect(explainSvgPathData('M0 0 A5 5 0 0 1 10')).toEqual(explained(18, 'expected-arc-parameters'));
    expect(explainSvgPathData('  z')).toEqual(explained(2, 'expected-moveto'));
  });
  it('keeps reading operands after a failed flag as the source does', () => {
    expect(explainSvgPathData('M0 0 A1 1 0 5 6')).toEqual(explained(15, 'expected-arc-parameters'));
  });
  it('stops an operand run at any letter', () => {
    expect(explainSvgPathData('M0 0 1 1 k')).toEqual(explained(9, 'expected-command'));
    expect(explainSvgPathData('M0 0 L1 1 #')).toEqual(explained(10, 'expected-coordinate-pair'));
  });
});

describe('formatSvgPathData', () => {
  it('emits absolute m l c q z commands per segment kind', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M0 0 L10 0 Q15 5 20 0 C22 2 24 2 26 0 Z');
    expect(formatSvgPathData(path, undefined)).toEqual('M0 0L10 0Q15 5 20 0C22 2 24 2 26 0Z');
  });
  it('rounds coordinates and trims trailing zeros with a precision option', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M0.123456 0.5 L10.987654 20');
    expect(formatSvgPathData(path, precision(2.0))).toEqual('M0.12 0.5L10.99 20');
  });
  it('emits full precision by default', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M0.5 0.25 L1.5 2.75');
    expect(formatSvgPathData(path, undefined)).toEqual('M0.5 0.25L1.5 2.75');
    expect(formatSvgPathData(path, precision(undefined))).toEqual('M0.5 0.25L1.5 2.75');
  });
  it('emits no a command arcs are stored as cubics', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M0 0 A5 5 0 0 1 10 0');
    const d = formatSvgPathData(path, undefined);
    expect(!d.includes('A')).toBe(true);
    expect(d.startsWith('M0 0C')).toBe(true);
  });
  it('keeps an explicit zero precision distinct from omitted', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M1.5 -1.5 L2.4 -2.5');
    expect(formatSvgPathData(path, undefined)).toEqual('M1.5 -1.5L2.4 -2.5');
    expect(formatSvgPathData(path, precision(0.0))).toEqual('M2 -1L2 -2');
  });
  it('spells numbers as javascript string does', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M1e21 1e-7 L123456789012345680000 0.000001 L-0 0.1');
    expect(formatSvgPathData(path, undefined)).toEqual('M1e+21 1e-7L123456789012345680000 0.000001L0 0.1');
    let tiny = createPath('nonZero');
    appendSvgPathData(tiny, 'M1.5e-10 -2.25e30 L5e-324 1.7976931348623157e308');
    expect(formatSvgPathData(tiny, undefined)).toEqual('M1.5e-10 -2.25e+30L5e-324 1.7976931348623157e+308');
  });
  it('normalizes a rounded negative zero to zero', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M-0.001 -0.004');
    expect(formatSvgPathData(path, precision(2.0))).toEqual('M0 0');
  });
  it('rounds to tens with a negative precision', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M123 125 L-125 -0.4');
    expect(formatSvgPathData(path, precision(-1.0))).toEqual('M120 130L-120 0');
  });
  it('applies a fractional precision through the power of ten', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M1 0');
    const d = formatSvgPathData(path, precision(0.5));
    const x: number = ((s) => {
      const v = Number(s);
      return s.trim() !== '' && !Number.isNaN(v) ? v : undefined;
    })(
      d.slice(
        1,
        ((value: string, pattern: string): number | undefined => {
          const index = value.indexOf(pattern);
          return index === -1 ? undefined : index;
        })(d, ' ')!,
      ),
    )!;
    expect(Math.abs(x - 0.9486832980505138) < 1e-15).toBe(true);
    expect(d.endsWith(' 0')).toBe(true);
  });
  it('yields nan for non finite or overflowing precision', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M1 0');
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 400.0]) {
      expect(formatSvgPathData(path, precision(value))).toEqual('MNaN NaN');
    }
  });
  it('spells non finite coordinates as javascript does', () => {
    let path = createPath('nonZero');
    path.commands.push(PathCommand.MOVE_TO & 0xff);
    path.data.push(Number.NaN);
    path.data.push(Number.POSITIVE_INFINITY);
    path.commands.push(PathCommand.LINE_TO & 0xff);
    path.data.push(Number.NEGATIVE_INFINITY);
    path.data.push(-0.0);
    expect(formatSvgPathData(path, undefined)).toEqual('MNaN InfinityL-Infinity 0');
    expect(formatSvgPathData(path, precision(2.0))).toEqual('MNaN InfinityL-Infinity 0');
  });
  it('keeps extreme magnitudes through a precision option', () => {
    let path = createPath('nonZero');
    appendSvgPathData(path, 'M1e300 -1e-300');
    expect(formatSvgPathData(path, precision(2.0))).toEqual('M1e+300 0');
  });
  it('emits an empty string for an empty path', () => {
    expect(formatSvgPathData(createPath('nonZero'), undefined)).toEqual('');
  });
});

describe('parseSvgPathData', () => {
  it('parses absolute moveto and lineto', () => {
    expect(parsed('M0 0 L10 10')).toEqual([
      { x: 0.0, y: 0.0 },
      { x: 10.0, y: 10.0 },
    ]);
  });
  it('treats repeated moveto operands as implicit lineto', () => {
    expect(parsed('M0 0 1 1 2 2')).toEqual([
      { x: 0.0, y: 0.0 },
      { x: 1.0, y: 1.0 },
      { x: 2.0, y: 2.0 },
    ]);
  });
  it('resolves relative commands against the current point', () => {
    expect(parsed('m10 10 l5 5 l-5 0')).toEqual([
      { x: 10.0, y: 10.0 },
      { x: 15.0, y: 15.0 },
      { x: 10.0, y: 15.0 },
    ]);
  });
  it('treats repeated relative moveto operands as relative lineto', () => {
    expect(parsed('m1 1 2 2')).toEqual([
      { x: 1.0, y: 1.0 },
      { x: 3.0, y: 3.0 },
    ]);
  });
  it('maps horizontal and vertical lineto absolute and relative', () => {
    expect(parsed('M0 0 H10 V20 h5 v-5')).toEqual([
      { x: 0.0, y: 0.0 },
      { x: 10.0, y: 0.0 },
      { x: 10.0, y: 20.0 },
      { x: 15.0, y: 20.0 },
      { x: 15.0, y: 15.0 },
    ]);
  });
  it('parses cubic curves', () => {
    expect(parsed('M0 0 C1 2 3 4 5 6')).toEqual([
      { x: 0.0, y: 0.0 },
      { controlX1: 1.0, controlY1: 2.0, controlX2: 3.0, controlY2: 4.0, x: 5.0, y: 6.0 },
    ]);
  });
  it('reflects the previous cubic control for the s shorthand', () => {
    expect(parsed('M0 0 C1 2 3 4 5 6 S3 3 4 4')[2]).toEqual({
      controlX1: 7.0,
      controlY1: 8.0,
      controlX2: 3.0,
      controlY2: 3.0,
      x: 4.0,
      y: 4.0,
    });
  });
  it('uses the current point as the s control when the previous command was not a cubic', () => {
    expect(parsed('M0 0 L2 2 S3 3 4 4')[2]).toEqual({
      controlX1: 2.0,
      controlY1: 2.0,
      controlX2: 3.0,
      controlY2: 3.0,
      x: 4.0,
      y: 4.0,
    });
  });
  it('parses quadratic curves', () => {
    expect(parsed('M0 0 Q1 1 2 2')).toEqual([
      { x: 0.0, y: 0.0 },
      { controlX: 1.0, controlY: 1.0, x: 2.0, y: 2.0 },
    ]);
  });
  it('preserves the quadratic command numeric value in the parsed path', () => {
    const path = parseSvgPathData('M0 0 Q1 1 2 2')!;
    expect(PathCommand.QUADRATIC_CURVE_TO & 0xff).toEqual(3);
    expect(path.commands).toEqual([PathCommand.MOVE_TO & 0xff, 3]);
  });
  it('reflects the previous quadratic control for the t shorthand', () => {
    expect(parsed('M0 0 Q1 1 2 2 T4 4')[2]).toEqual({ controlX: 3.0, controlY: 3.0, x: 4.0, y: 4.0 });
  });
  it('uses the current point as the t control when the previous command was not a quadratic', () => {
    expect(parsed('M0 0 L2 2 T4 4')[2]).toEqual({ controlX: 2.0, controlY: 2.0, x: 4.0, y: 4.0 });
  });
  it('appends an arc as cubic segments ending at the arc endpoint', () => {
    const segments = parsed('M0 0 A5 5 0 0 1 10 0');
    expect(kinds(segments)[0]).toEqual('moveTo');
    expect(kinds(segments)[1]).toEqual('cubicCurveTo');
    const [x, y] = lastPoint(segments);
    expect(Math.abs(x - 10.0) < 5e-7).toBe(true);
    expect(Math.abs(y) < 5e-7).toBe(true);
  });
  it('starts an arc after close at the closed subpath origin', () => {
    expect(parsed('M0 0 L10 0 Z A5 5 0 0 1 10 0')).toEqual(parsed('M0 0 L10 0 Z M0 0 A5 5 0 0 1 10 0'));
  });
  it('closes contours and returns the current point to the subpath start', () => {
    const segments = parsed('M0 0 L10 0 L10 10 Z L5 5');
    expect(kinds(segments)).toEqual(['moveTo', 'lineTo', 'lineTo', 'close', 'lineTo']);
    expect(segments[4]).toEqual({ x: 5.0, y: 5.0 });
    expect(parsed('M1 1 L9 9 z l1 0')[3]).toEqual({ x: 2.0, y: 1.0 });
  });
  it('tokenizes numbers with no space before a negative sign', () => {
    expect(parsed('M0 0L10-5')).toEqual([
      { x: 0.0, y: 0.0 },
      { x: 10.0, y: -5.0 },
    ]);
  });
  it('tokenizes scientific notation and comma separators', () => {
    expect(parsed('M1e1,1e1 L2E1,-1.5e1')).toEqual([
      { x: 10.0, y: 10.0 },
      { x: 20.0, y: -15.0 },
    ]);
  });
  it('tokenizes leading dots packed decimals explicit plus signs and trailing dots', () => {
    expect(parsed('M.5.5 L+2 +3 L10. 20.')).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 2.0, y: 3.0 },
      { x: 10.0, y: 20.0 },
    ]);
  });
  it('tokenizes a trailing dot before an exponent and every separator', () => {
    expect(parsed('M1.e1\t\n\r\u{c}2e+1')).toEqual([{ x: 10.0, y: 20.0 }]);
  });
  it('rejects a dangling exponent after backtracking the numeric token', () => {
    expect(parseSvgPathData('M1e 0') === undefined).toBe(true);
  });
  it('accepts large finite coordinates at both signs', () => {
    expect(parsed('M1e308 -1e308')).toEqual([{ x: 1e308, y: -1e308 }]);
  });
  it('accepts an underflowing token as signed zero', () => {
    const segments = parsed('M1e-400 -1e-400');
    const $letElse = segments[0];
    if (!($letElse.kind === 'moveTo')) {
      throw new Error(`expected moveto`);
    }
    const x = $letElse.x;
    const y = $letElse.y;
    expect([x, y]).toEqual([0.0, 0.0]);
    expect((x > 0 || Object.is(x, 0)) && (y < 0 || Object.is(y, -0))).toBe(true);
  });
  it('returns null when a numeric token overflows at either sign', () => {
    expect(parseSvgPathData('M1e999 0') === undefined).toBe(true);
    expect(parseSvgPathData('M-1e999 0') === undefined).toBe(true);
  });
  it('parses packed arc flags with no separators', () => {
    const [x, y] = lastPoint(parsed('M0 0A5 5 0 0110 0'));
    expect(Math.abs(x - 10.0) < 5e-7).toBe(true);
    expect(Math.abs(y) < 5e-7).toBe(true);
  });
  it('resolves a relative arc endpoint against the current point', () => {
    expect(parsed('M2 3 a5 5 0 0 1 10 0')).toEqual(parsed('M2 3 A5 5 0 0 1 12 3'));
  });
  it('returns an empty path for empty or whitespace only input', () => {
    expect(parsed('').length === 0).toBe(true);
    expect(parsed('   \n  ').length === 0).toBe(true);
  });
  it('returns null when the path does not begin with a moveto', () => {
    expect(parseSvgPathData('L10 10') === undefined).toBe(true);
  });
  it('returns null on an unknown command letter', () => {
    expect(parseSvgPathData('M0 0 X10 10') === undefined).toBe(true);
  });
  it('returns null on a short coordinate run', () => {
    expect(parseSvgPathData('M0 0 L10') === undefined).toBe(true);
    expect(parseSvgPathData('M') === undefined).toBe(true);
    expect(parseSvgPathData('M0 0 C1 2 3 4 5') === undefined).toBe(true);
  });
  it('round trips representative path data through format and back', () => {
    const cases = [
      'M0 0 L10 0 L10 10 Z',
      'M0 0 C1 2 3 4 5 6 S7 8 9 10',
      'M0 0 Q1 1 2 2 T4 4 T6 0',
      'm10 10 h20 v20 h-20 z',
      'M0 0 A5 5 0 0 1 10 0 A5 5 0 0 1 20 0',
    ];
    for (const d of cases) {
      const first = (() => {
        const value = parseSvgPathData(d);
        if (value === undefined) throw new Error('first parse');
        return value;
      })();
      const reserialized = formatSvgPathData(first, undefined);
      const second = (() => {
        const value = parseSvgPathData(reserialized);
        if (value === undefined) throw new Error('second parse');
        return value;
      })();
      const a = collectSegments(first);
      const b = collectSegments(second);
      expect(b.length).toEqual(a.length);
      for (let i = 0; i < a.length; i += 1) {
        expect(kinds(b.slice(i, i + 1))).toEqual(kinds(a.slice(i, i + 1)));
        for (const [bv, av] of values(b[i]).map((item, index) => [item, values(a[i])[index]] as const)) {
          expect(Math.abs(bv - av) < 5e-7, `${d}: ${bv} vs ${av}`).toBe(true);
        }
      }
    }
  });
});
