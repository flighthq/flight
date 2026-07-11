import { createPath, forEachPathSegment } from '@flighthq/path';
import type { Path, PathSegment } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { appendSvgPathData, formatSvgPathData, parseSvgPathData } from './svgPathData';

function collectSegments(path: Readonly<Path>): PathSegment[] {
  const segments: PathSegment[] = [];
  forEachPathSegment(path, (segment) => segments.push(segment));
  return segments;
}

describe('appendSvgPathData', () => {
  it('appends into an existing path without clearing it', () => {
    const path = createPath();
    appendSvgPathData(path, 'M0 0 L10 0');
    const ok = appendSvgPathData(path, 'M20 20 L30 20');
    expect(ok).toBe(true);
    const segments = collectSegments(path);
    expect(segments.map((s) => s.kind)).toEqual(['moveTo', 'lineTo', 'moveTo', 'lineTo']);
  });

  it('returns false on malformed input', () => {
    const path = createPath();
    expect(appendSvgPathData(path, 'L10 10')).toBe(false);
  });
});

describe('formatSvgPathData', () => {
  it('emits absolute M/L/C/Q/Z commands per segment kind', () => {
    const path = createPath();
    appendSvgPathData(path, 'M0 0 L10 0 Q15 5 20 0 C22 2 24 2 26 0 Z');
    expect(formatSvgPathData(path)).toBe('M0 0L10 0Q15 5 20 0C22 2 24 2 26 0Z');
  });

  it('rounds coordinates and trims trailing zeros with a precision option', () => {
    const path = createPath();
    appendSvgPathData(path, 'M0.123456 0.5 L10.987654 20');
    expect(formatSvgPathData(path, { precision: 2 })).toBe('M0.12 0.5L10.99 20');
  });

  it('emits full precision by default', () => {
    const path = createPath();
    appendSvgPathData(path, 'M0.5 0.25 L1.5 2.75');
    expect(formatSvgPathData(path)).toBe('M0.5 0.25L1.5 2.75');
  });

  it('emits no A command — arcs are stored as cubics', () => {
    const path = createPath();
    appendSvgPathData(path, 'M0 0 A5 5 0 0 1 10 0');
    const d = formatSvgPathData(path);
    expect(d).not.toContain('A');
    expect(d.startsWith('M0 0C')).toBe(true);
  });
});

describe('parseSvgPathData', () => {
  it('parses absolute moveto and lineto', () => {
    const path = parseSvgPathData('M0 0 L10 10');
    expect(path).not.toBeNull();
    expect(collectSegments(path as Path)).toEqual([
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'lineTo', x: 10, y: 10 },
    ]);
  });

  it('treats repeated moveto operands as implicit lineto', () => {
    const path = parseSvgPathData('M0 0 1 1 2 2');
    expect(collectSegments(path as Path)).toEqual([
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'lineTo', x: 1, y: 1 },
      { kind: 'lineTo', x: 2, y: 2 },
    ]);
  });

  it('resolves relative commands against the current point', () => {
    const path = parseSvgPathData('m10 10 l5 5 l-5 0');
    expect(collectSegments(path as Path)).toEqual([
      { kind: 'moveTo', x: 10, y: 10 },
      { kind: 'lineTo', x: 15, y: 15 },
      { kind: 'lineTo', x: 10, y: 15 },
    ]);
  });

  it('maps horizontal and vertical lineto (absolute and relative)', () => {
    const path = parseSvgPathData('M0 0 H10 V20 h5 v-5');
    expect(collectSegments(path as Path)).toEqual([
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'lineTo', x: 10, y: 0 },
      { kind: 'lineTo', x: 10, y: 20 },
      { kind: 'lineTo', x: 15, y: 20 },
      { kind: 'lineTo', x: 15, y: 15 },
    ]);
  });

  it('parses cubic curves', () => {
    const path = parseSvgPathData('M0 0 C1 2 3 4 5 6');
    expect(collectSegments(path as Path)).toEqual([
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'cubicCurveTo', control1X: 1, control1Y: 2, control2X: 3, control2Y: 4, x: 5, y: 6 },
    ]);
  });

  it('reflects the previous cubic control for the S shorthand', () => {
    const path = parseSvgPathData('M0 0 C1 2 3 4 5 6 S3 3 4 4');
    const segments = collectSegments(path as Path);
    expect(segments[2]).toEqual({
      kind: 'cubicCurveTo',
      control1X: 7,
      control1Y: 8,
      control2X: 3,
      control2Y: 3,
      x: 4,
      y: 4,
    });
  });

  it('uses the current point as the S control when the previous command was not a cubic', () => {
    const path = parseSvgPathData('M0 0 L2 2 S3 3 4 4');
    const segments = collectSegments(path as Path);
    expect(segments[2]).toEqual({
      kind: 'cubicCurveTo',
      control1X: 2,
      control1Y: 2,
      control2X: 3,
      control2Y: 3,
      x: 4,
      y: 4,
    });
  });

  it('parses quadratic curves', () => {
    const path = parseSvgPathData('M0 0 Q1 1 2 2');
    expect(collectSegments(path as Path)).toEqual([
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'curveTo', controlX: 1, controlY: 1, x: 2, y: 2 },
    ]);
  });

  it('reflects the previous quadratic control for the T shorthand', () => {
    const path = parseSvgPathData('M0 0 Q1 1 2 2 T4 4');
    const segments = collectSegments(path as Path);
    expect(segments[2]).toEqual({ kind: 'curveTo', controlX: 3, controlY: 3, x: 4, y: 4 });
  });

  it('appends an arc as cubic segments ending at the arc endpoint', () => {
    const path = parseSvgPathData('M0 0 A5 5 0 0 1 10 0');
    expect(path).not.toBeNull();
    const segments = collectSegments(path as Path);
    expect(segments[0].kind).toBe('moveTo');
    expect(segments[1].kind).toBe('cubicCurveTo');
    const last = segments[segments.length - 1] as Extract<PathSegment, { kind: 'cubicCurveTo' }>;
    expect(last.x).toBeCloseTo(10, 6);
    expect(last.y).toBeCloseTo(0, 6);
  });

  it('closes contours and returns the current point to the subpath start', () => {
    const path = parseSvgPathData('M0 0 L10 0 L10 10 Z L5 5');
    const segments = collectSegments(path as Path);
    expect(segments.map((s) => s.kind)).toEqual(['moveTo', 'lineTo', 'lineTo', 'close', 'lineTo']);
    // The lineto after Z starts from the subpath origin (0,0) and goes to (5,5).
    expect(segments[4]).toEqual({ kind: 'lineTo', x: 5, y: 5 });
  });

  it('tokenizes numbers with no space before a negative sign', () => {
    const path = parseSvgPathData('M0 0L10-5');
    expect(collectSegments(path as Path)).toEqual([
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'lineTo', x: 10, y: -5 },
    ]);
  });

  it('tokenizes scientific notation and comma separators', () => {
    const path = parseSvgPathData('M1e1,1e1 L2E1,-1.5e1');
    expect(collectSegments(path as Path)).toEqual([
      { kind: 'moveTo', x: 10, y: 10 },
      { kind: 'lineTo', x: 20, y: -15 },
    ]);
  });

  it('parses packed arc flags with no separators', () => {
    const path = parseSvgPathData('M0 0A5 5 0 0110 0');
    expect(path).not.toBeNull();
    const segments = collectSegments(path as Path);
    const last = segments[segments.length - 1] as Extract<PathSegment, { kind: 'cubicCurveTo' }>;
    expect(last.x).toBeCloseTo(10, 6);
    expect(last.y).toBeCloseTo(0, 6);
  });

  it('returns an empty path for empty or whitespace-only input', () => {
    expect(collectSegments(parseSvgPathData('') as Path)).toEqual([]);
    expect(collectSegments(parseSvgPathData('   \n  ') as Path)).toEqual([]);
  });

  it('returns null when the path does not begin with a moveto', () => {
    expect(parseSvgPathData('L10 10')).toBeNull();
  });

  it('returns null on an unknown command letter', () => {
    expect(parseSvgPathData('M0 0 X10 10')).toBeNull();
  });

  it('returns null on a short coordinate run', () => {
    expect(parseSvgPathData('M0 0 L10')).toBeNull();
    expect(parseSvgPathData('M')).toBeNull();
    expect(parseSvgPathData('M0 0 C1 2 3 4 5')).toBeNull();
  });

  it('round-trips representative path data through format and back', () => {
    const cases = [
      'M0 0 L10 0 L10 10 Z',
      'M0 0 C1 2 3 4 5 6 S7 8 9 10',
      'M0 0 Q1 1 2 2 T4 4 T6 0',
      'm10 10 h20 v20 h-20 z',
      'M0 0 A5 5 0 0 1 10 0 A5 5 0 0 1 20 0',
    ];
    for (const d of cases) {
      const first = parseSvgPathData(d);
      expect(first).not.toBeNull();
      const reserialized = formatSvgPathData(first as Path);
      const second = parseSvgPathData(reserialized);
      expect(second).not.toBeNull();
      const a = collectSegments(first as Path);
      const b = collectSegments(second as Path);
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i].kind).toBe(a[i].kind);
        const av = a[i] as unknown as Record<string, number>;
        const bv = b[i] as unknown as Record<string, number>;
        for (const key of Object.keys(av)) {
          if (key === 'kind') continue;
          expect(bv[key]).toBeCloseTo(av[key], 6);
        }
      }
    }
  });
});
