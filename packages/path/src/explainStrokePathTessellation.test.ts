// Generated from crates/flight-path/tests/explain_stroke_path_tessellation_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  createPath,
  explainStrokePathTessellation,
} from './contract.ts';
import type { StrokeStyle } from './contract.ts';

describe('explainStrokePathTessellation', () => {
  it('reports a supported simple closed ring', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 50.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 10.0;
    const explanation = explainStrokePathTessellation(path, style, 0.25);
    expect(explanation.reason).toEqual('ok');
    expect(explanation.subpath).toEqual(null);
    expect(explanation.supported).toBe(true);
  });
  it('reports supported for valid stroke', () => {
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
    const explanation = explainStrokePathTessellation(path, style, 0.25);
    expect(explanation.supported).toBe(true);
    expect(explanation.reason).toEqual('ok');
  });
  it('reports invalid style for zero width', () => {
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
    const explanation = explainStrokePathTessellation(path, style, 0.25);
    expect(!explanation.supported).toBe(true);
    expect(explanation.reason).toEqual('invalid-style');
  });
  it('identifies self intersecting subpath', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 40.0, 40.0);
    appendPathLineTo(path, 0.0, 40.0);
    appendPathLineTo(path, 40.0, 0.0);
    appendPathClose(path);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 8.0;
    const explanation = explainStrokePathTessellation(path, style, 0.25);
    expect(!explanation.supported).toBe(true);
    expect(explanation.reason).toEqual('self-intersecting-centerline');
    expect(explanation.subpath).toEqual(0);
  });
  it('reports invalid style for negative width', () => {
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
    style.width = -5.0;
    const explanation = explainStrokePathTessellation(path, style, 0.25);
    expect(!explanation.supported).toBe(true);
    expect(explanation.reason).toEqual('invalid-style');
  });
  it('reports invalid style input without throwing', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    let style: StrokeStyle = {
      width: 1.0,
      cap: 'butt',
      join: 'miter',
      miterLimit: 4.0,
      dash: [] as never[],
      dashOffset: 0.0,
    };
    style.width = 0.0;
    const explanation = explainStrokePathTessellation(path, style, 0.25);
    expect(explanation.reason).toEqual('invalid-style');
    expect(explanation.subpath).toEqual(null);
    expect(!explanation.supported).toBe(true);
  });
});
