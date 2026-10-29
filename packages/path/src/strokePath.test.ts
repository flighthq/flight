// Generated from crates/flight-path/tests/stroke_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  createPath,
  strokePath,
} from './contract.ts';
import type { PathRaw, StrokeStyle } from './contract.ts';

function axisValues(path: Readonly<PathRaw>, axis: number): number[] {
  let values: number[] = [] as never[];
  let i = axis;
  while (i < path.data.length) {
    values.push(path.data[i]);
    i += 2;
  }
  return values;
}

function countCommands(path: Readonly<PathRaw>, command: PathCommand): number {
  let count = 0;
  for (const candidate of path.commands) {
    if (candidate === command) {
      count += 1;
    }
  }
  return count;
}

function maxValue(values: Readonly<number[]>): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    max = Math.max(max, value);
  }
  return max;
}

function minValue(values: Readonly<number[]>): number {
  let min = Number.POSITIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
  }
  return min;
}

describe('strokePath', () => {
  it('returns empty for empty path', () => {
    const path = createPath('nonZero');
    const style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    } as const;
    const outline = strokePath(path, style, 0.25);
    expect(outline.commands.length === 0).toBe(true);
  });
  it('returns closed outline for horizontal line with butt caps', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 10.0;
    style.cap = 'butt';
    const result = strokePath(path, style, 0.25);
    expect(result.commands.includes(PathCommand.CLOSE)).toBe(true);
    expect(result.commands.includes(PathCommand.MOVE_TO)).toBe(true);
    const yValues: number[] = axisValues(result, 1);
    const maxY = maxValue(yValues);
    const minY = minValue(yValues);
    expect(Math.abs(maxY - 5.0) < 0.005).toBe(true);
    expect(Math.abs(minY - -5.0) < 0.005).toBe(true);
  });
  it('extends endpoints for square caps', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 10.0;
    style.cap = 'square';
    const result = strokePath(path, style, 0.25);
    const xValues: number[] = axisValues(result, 0);
    const minX = minValue(xValues);
    const maxX = maxValue(xValues);
    expect(Math.abs(minX - -5.0) < 0.005).toBe(true);
    expect(Math.abs(maxX - 105.0) < 0.005).toBe(true);
  });
  it('produces round caps with more points than butt caps', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let buttStyle: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    buttStyle.width = 10.0;
    buttStyle.cap = 'butt';
    const butt = strokePath(path, buttStyle, 0.25);
    let roundStyle: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    roundStyle.width = 10.0;
    roundStyle.cap = 'round';
    const round = strokePath(path, roundStyle, 0.25);
    expect(round.commands.length > butt.commands.length).toBe(true);
  });
  it('extends miter point past symmetric corner', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 290.0, 410.0);
    appendPathLineTo(path, 400.0, 520.0);
    appendPathLineTo(path, 510.0, 410.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 30.0;
    style.join = 'miter';
    style.cap = 'butt';
    style.miterLimit = 6.0;
    const result = strokePath(path, style, 0.25);
    let apexHits = 0;
    let maxY = Number.NEGATIVE_INFINITY;
    let i = 0;
    while (i < result.data.length) {
      if (Math.abs(result.data[i] - 400.0) < 1e-6 && Math.abs(result.data[i + 1] - 520.0) < 1e-6) {
        apexHits += 1;
      }
      if (result.data[i + 1] > maxY) {
        maxY = result.data[i + 1];
      }
      i += 2;
    }
    expect(apexHits).toEqual(0);
    expect(Math.abs(maxY - 541.2) < 1.0).toBe(true);
  });
  it('handles closed path without adding caps', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathClose(path);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 4.0;
    const result = strokePath(path, style, 0.25);
    expect(result.commands.includes(PathCommand.CLOSE)).toBe(true);
  });
  it('produces fewer outline points with coarser tolerance', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 10.0;
    style.cap = 'round';
    const fine = strokePath(path, style, 0.1).commands.length;
    const coarse = strokePath(path, style, 10.0).commands.length;
    expect(coarse <= fine).toBe(true);
  });
  it('dashes produce multiple segments for simple on off pattern', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 2.0;
    style.dash = [10.0, 10.0];
    const result = strokePath(path, style, 0.25);
    const moveCount = countCommands(result, PathCommand.MOVE_TO);
    expect(moveCount >= 2).toBe(true);
  });
  it('dashes dash offset shifts the pattern start position', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 25.0, 0.0);
    let style0: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style0.width = 2.0;
    style0.dash = [20.0, 5.0];
    style0.dashOffset = 0.0;
    const result0 = strokePath(path, style0, 0.25);
    let style15: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style15.width = 2.0;
    style15.dash = [20.0, 5.0];
    style15.dashOffset = 15.0;
    const result15 = strokePath(path, style15, 0.25);
    const moves0 = countCommands(result0, PathCommand.MOVE_TO);
    const moves15 = countCommands(result15, PathCommand.MOVE_TO);
    expect(moves0).toEqual(1);
    expect(moves15).toEqual(2);
  });
  it('dashes pattern wraps correctly across multiple path segments', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 25.0, 0.0);
    appendPathLineTo(path, 50.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 1.0;
    style.dash = [15.0, 5.0];
    const result = strokePath(path, style, 0.25);
    const moveCount = countCommands(result, PathCommand.MOVE_TO);
    expect(moveCount >= 2).toBe(true);
  });
  it('dashes very short segments produce correct number of dashes', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 5.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 1.0;
    style.dash = [10.0, 10.0];
    const result = strokePath(path, style, 0.25);
    const moveCount = countCommands(result, PathCommand.MOVE_TO);
    expect(moveCount).toEqual(1);
  });
  it('dashes zero length dash entry is ignored', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 2.0;
    style.dash = [0.0, 10.0, 10.0, 10.0];
    const Result = strokePath(path, style, 0.25);
  });
  it('dashes solid stroke with empty dash array produces single outline', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 4.0;
    style.dash = [];
    const result = strokePath(path, style, 0.25);
    const moveCount = countCommands(result, PathCommand.MOVE_TO);
    expect(moveCount).toEqual(1);
  });
  it('dashes multiple subpaths each get dash pattern applied', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathMoveTo(path, 0.0, 20.0);
    appendPathLineTo(path, 100.0, 20.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 2.0;
    style.dash = [30.0, 10.0];
    const result = strokePath(path, style, 0.25);
    const moveCount = countCommands(result, PathCommand.MOVE_TO);
    expect(moveCount >= 2).toBe(true);
  });
  it('produces wider outline for larger width', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let styleThin: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    styleThin.width = 2.0;
    const thin = strokePath(path, styleThin, 0.25);
    let styleThick: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    styleThick.width = 20.0;
    const thick = strokePath(path, styleThick, 0.25);
    expect(thick.data.length >= thin.data.length).toBe(true);
  });
});
