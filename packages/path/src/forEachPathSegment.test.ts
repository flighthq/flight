// Generated from crates/flight-path/tests/for_each_path_segment_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  createPath,
  forEachPathSegment,
} from './contract.ts';
import type { PathRaw, PathSegment } from './contract.ts';

function tsWirePath(commands: number[], data: number[]): PathRaw {
  let path = createPath('nonZero');
  path.commands = commands;
  path.data = data;
  return path;
}

describe('forEachPathSegment', () => {
  it('decodes a ts serialized stream and skips no op without consuming data', () => {
    const path = tsWirePath(
      [1, 0, 2, 3, 0, 6, 4, 5, 7],
      [
        1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, -1.0, -1.0, 15.0, 16.0, -1.0, -1.0,
        17.0, 18.0,
      ],
    );
    let segments: PathSegment[] = [] as never[];
    forEachPathSegment(path, (segment) => segments.push(segment));
    expect(segments).toEqual([
      { kind: 'moveTo' as const, x: 1.0, y: 2.0 },
      { kind: 'lineTo' as const, x: 3.0, y: 4.0 },
      { kind: 'quadraticCurveTo' as const, controlX: 5.0, controlY: 6.0, x: 7.0, y: 8.0 },
      {
        kind: 'cubicCurveTo' as const,
        controlX1: 9.0,
        controlY1: 10.0,
        controlX2: 11.0,
        controlY2: 12.0,
        x: 13.0,
        y: 14.0,
      },
      { kind: 'moveTo' as const, x: 15.0, y: 16.0 },
      { kind: 'lineTo' as const, x: 17.0, y: 18.0 },
      { kind: 'close' as const },
    ]);
  });
  it('visits nothing for empty path', () => {
    const path = createPath('nonZero');
    let segments: PathSegment[] = [] as never[];
    forEachPathSegment(path, (segment) => segments.push(segment));
    expect(segments.length === 0).toBe(true);
  });
  it('yields move to and line to segments in order', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 1.0, 2.0);
    appendPathLineTo(path, 3.0, 4.0);
    let segments: PathSegment[] = [] as never[];
    forEachPathSegment(path, (segment) => segments.push(segment));
    expect(segments.length).toEqual(2);
    expect(segments[0]).toEqual({ kind: 'moveTo' as const, x: 1.0, y: 2.0 });
    expect(segments[1]).toEqual({ kind: 'lineTo' as const, x: 3.0, y: 4.0 });
  });
  it('yields quadratic curve to with correct coordinates', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 10.0, 20.0, 30.0, 0.0);
    let segments: PathSegment[] = [] as never[];
    forEachPathSegment(path, (segment) => segments.push(segment));
    expect(segments[1]).toEqual({ kind: 'quadraticCurveTo' as const, controlX: 10.0, controlY: 20.0, x: 30.0, y: 0.0 });
  });
  it('yields cubic curve to with correct coordinates', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathCubicCurveTo(path, 10.0, 20.0, 30.0, 40.0, 50.0, 0.0);
    let segments: PathSegment[] = [] as never[];
    forEachPathSegment(path, (segment) => segments.push(segment));
    expect(segments[1]).toEqual({
      kind: 'cubicCurveTo' as const,
      controlX1: 10.0,
      controlY1: 20.0,
      controlX2: 30.0,
      controlY2: 40.0,
      x: 50.0,
      y: 0.0,
    });
  });
  it('yields close segment', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathClose(path);
    let segments: PathSegment[] = [] as never[];
    forEachPathSegment(path, (segment) => segments.push(segment));
    expect(segments[2]).toEqual({ kind: 'close' as const });
  });
  it('normalizes wide move to to move to', () => {
    let path = createPath('nonZero');
    path.commands.push(PathCommand.WIDE_MOVE_TO);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(5.0);
    path.data.push(6.0);
    let segments: PathSegment[] = [] as never[];
    forEachPathSegment(path, (segment) => segments.push(segment));
    expect(segments.length).toEqual(1);
    expect(segments[0]).toEqual({ kind: 'moveTo' as const, x: 5.0, y: 6.0 });
  });
  it('normalizes wide line to', () => {
    let path = createPath('nonZero');
    path.commands.push(PathCommand.WIDE_MOVE_TO);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(0.0);
    path.commands.push(PathCommand.WIDE_LINE_TO);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(7.0);
    path.data.push(8.0);
    let segments: PathSegment[] = [] as never[];
    forEachPathSegment(path, (segment) => segments.push(segment));
    expect(segments[1]).toEqual({ kind: 'lineTo' as const, x: 7.0, y: 8.0 });
  });
});
