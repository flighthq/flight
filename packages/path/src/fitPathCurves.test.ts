// Generated from crates/flight-path/tests/fit_path_curves_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { PathCommand, appendPathLineTo, appendPathMoveTo, createPath, fitPathCurves } from './contract.ts';
import type { PathRaw } from './contract.ts';

function countCommands(path: Readonly<PathRaw>, command: PathCommand): number {
  let count = 0;
  for (const candidate of path.commands) {
    if (candidate === command) {
      count += 1;
    }
  }
  return count;
}

describe('fitPathCurves', () => {
  it('keeps straight line as line', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 50.0, 0.0);
    appendPathLineTo(source, 100.0, 0.0);
    let out = createPath('nonZero');
    fitPathCurves(source, 1.0, out, 0.25);
    expect(out.commands[0]).toEqual(PathCommand.MOVE_TO);
    expect(!out.commands.includes(PathCommand.CLOSE)).toBe(true);
    const lastX = out.data[out.data.length - 2];
    const lastY = out.data[out.data.length - 1];
    expect(Math.abs(lastX - 100.0) < 0.005).toBe(true);
    expect(Math.abs(lastY) < 0.005).toBe(true);
  });
  it('produces smooth curves from circle like polyline', () => {
    let source = createPath('nonZero');
    const n = 16;
    const r = 50.0;
    for (let i = 0; i < n; i += 1) {
      const angle = (i / n) * Math.PI * 2.0;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) {
        appendPathMoveTo(source, x, y);
      } else {
        appendPathLineTo(source, x, y);
      }
    }
    let out = createPath('nonZero');
    fitPathCurves(source, 1.0, out, 0.25);
    const cubicCount = countCommands(out, PathCommand.CUBIC_CURVE_TO);
    expect(cubicCount > 0).toBe(true);
    expect(cubicCount < n).toBe(true);
  });
  it('handles single segment', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 100.0, 100.0);
    let out = createPath('nonZero');
    fitPathCurves(source, 1.0, out, 0.25);
    expect(out.commands[0]).toEqual(PathCommand.MOVE_TO);
    expect(out.data.includes(100.0)).toBe(true);
  });
  it('handles empty path', () => {
    const source = createPath('nonZero');
    let out = createPath('nonZero');
    fitPathCurves(source, 1.0, out, 0.25);
    expect(out.commands.length === 0).toBe(true);
  });
  it('preserves winding rule', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 100.0, 0.0);
    appendPathLineTo(source, 100.0, 100.0);
    let out = createPath('nonZero');
    fitPathCurves(source, 1.0, out, 0.25);
    expect(out.winding).toEqual('evenOdd');
  });
  it('is alias safe when source and out are same', () => {
    let path = createPath('nonZero');
    path.winding = 'evenOdd';
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 25.0, 20.0);
    appendPathLineTo(path, 50.0, 30.0);
    appendPathLineTo(path, 75.0, 20.0);
    appendPathLineTo(path, 100.0, 0.0);
    let expected = createPath('nonZero');
    fitPathCurves(path, 1.0, expected, 0.25);
    fitPathCurves(path, 1.0, path, 0.25);
    expect(path.commands).toEqual(expected.commands);
    expect(path.data).toEqual(expected.data);
    expect(path.winding).toEqual(expected.winding);
  });
  it('produces cubics from polyline', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 20.0, 30.0);
    appendPathLineTo(source, 50.0, 40.0);
    appendPathLineTo(source, 80.0, 30.0);
    appendPathLineTo(source, 100.0, 0.0);
    let out = createPath('nonZero');
    fitPathCurves(source, 1.0, out, 0.25);
    const hasCubic = out.commands.some((c) => c === PathCommand.CUBIC_CURVE_TO);
    expect(hasCubic).toBe(true);
  });
});
