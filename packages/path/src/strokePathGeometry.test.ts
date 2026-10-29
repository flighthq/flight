// Generated from crates/flight-path/tests/stroke_path_geometry_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  buildStrokePathGeometry,
  createPath,
} from './contract.ts';
import type { StrokeStyle } from './contract.ts';

describe('buildStrokePathGeometry', () => {
  it('returns invalid style for zero width', () => {
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
    style.width = 0.0;
    const geometry = buildStrokePathGeometry(path, style, 0.25);
    expect(geometry.issue).toEqual('invalid-style');
  });
  it('returns ok for valid line', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    const style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    } as const;
    const geometry = buildStrokePathGeometry(path, style, 0.25);
    expect(geometry.issue).toEqual('ok');
    expect(geometry.pieces.length !== 0).toBe(true);
  });
  it('builds paired closed ring sections and reports pathological centerlines', () => {
    let rectangle = createPath('nonZero');
    appendPathRectangle(rectangle, 0.0, 0.0, 100.0, 50.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 10.0;
    const valid = buildStrokePathGeometry(rectangle, style, 0.25);
    expect(valid.issue).toEqual('ok');
    expect(valid.pieces.length).toEqual(1);
    expect(valid.pieces[0].closed).toBe(true);
    expect(valid.pieces[0].left.length).toEqual(valid.pieces[0].right.length);
    let crossing = createPath('nonZero');
    appendPathMoveTo(crossing, 0.0, 0.0);
    appendPathLineTo(crossing, 40.0, 40.0);
    appendPathLineTo(crossing, 0.0, 40.0);
    appendPathLineTo(crossing, 40.0, 0.0);
    let crossingStyle: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    crossingStyle.width = 10.0;
    const invalid = buildStrokePathGeometry(crossing, crossingStyle, 0.25);
    expect(invalid.issue).toEqual('self-intersecting-centerline');
    expect(invalid.issueSubpath).toEqual(0);
  });
  it('produces left and right sides', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    const style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    } as const;
    const geometry = buildStrokePathGeometry(path, style, 0.25);
    expect(geometry.pieces[0].left.length !== 0).toBe(true);
    expect(geometry.pieces[0].right.length !== 0).toBe(true);
  });
});
