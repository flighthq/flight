// Generated from crates/flight-path/tests/path_morph_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathCircle,
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  appendPathRectangle,
  createPath,
  createPathMorph,
  samplePathMorph,
} from './contract.ts';

describe('createPathMorph', () => {
  it('normalizes different line and quadratic verbs to cubic', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    appendPathLineTo(start, 6.0, 0.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 2.0, 2.0);
    appendPathQuadraticCurveTo(end, 5.0, 8.0, 8.0, 2.0);
    const morph = createPathMorph(start, end)!;
    expect(morph.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO]);
    expect(morph.startData).toEqual([0.0, 0.0, 2.0, 0.0, 4.0, 0.0, 6.0, 0.0]);
    expect(morph.endData).toEqual([2.0, 2.0, 4.0, 6.0, 6.0, 6.0, 8.0, 2.0]);
  });
  it('preserves authored cubic control points', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    appendPathLineTo(start, 9.0, 0.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 1.0, 2.0);
    appendPathCubicCurveTo(end, 3.0, 4.0, 6.0, 8.0, 10.0, 12.0);
    const morph = createPathMorph(start, end)!;
    expect(morph.endData).toEqual([1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 10.0, 12.0]);
  });
  it('aligns equivalent closed contours from different starting vertices', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 10.0, 10.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 10.0, 0.0);
    appendPathLineTo(end, 10.0, 10.0);
    appendPathLineTo(end, 0.0, 10.0);
    appendPathLineTo(end, 0.0, 0.0);
    appendPathClose(end);
    const morph = createPathMorph(start, end)!;
    expect(morph.startData).toEqual(morph.endData);
    expect(morph.commands[morph.commands.length - 1]).toEqual(PathCommand.CLOSE);
  });
  it('does not mutate either endpoint', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    appendPathLineTo(start, 10.0, 0.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 0.0, 0.0);
    appendPathLineTo(end, 5.0, 5.0);
    appendPathLineTo(end, 10.0, 0.0);
    const startCmds = start.commands.slice();
    const startData = start.data.slice();
    const endCmds = end.commands.slice();
    const endData = end.data.slice();
    createPathMorph(start, end);
    expect(start.commands).toEqual(startCmds);
    expect(start.data).toEqual(startData);
    expect(end.commands).toEqual(endCmds);
    expect(end.data).toEqual(endData);
  });
  it('returns none for incompatible topology', () => {
    const start = createPath('nonZero');
    let end = createPath('nonZero');
    end.winding = 'evenOdd';
    expect(createPathMorph(start, end) === null).toBe(true);
  });
  it('returns some for compatible rectangles', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 100.0, 100.0);
    let end = createPath('nonZero');
    appendPathRectangle(end, 50.0, 50.0, 200.0, 200.0);
    expect(createPathMorph(start, end) !== null).toBe(true);
  });
  it('returns none for contour count mismatch', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 100.0, 100.0);
    let end = createPath('nonZero');
    appendPathRectangle(end, 0.0, 0.0, 100.0, 100.0);
    appendPathRectangle(end, 200.0, 200.0, 50.0, 50.0);
    expect(createPathMorph(start, end) === null).toBe(true);
  });
  it('expands a closed point contour without inventing an orientation', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 3.0, 4.0);
    appendPathClose(start);
    let end = createPath('nonZero');
    appendPathRectangle(end, 0.0, 0.0, 10.0, 10.0);
    const morph = createPathMorph(start, end)!;
    expect(morph.commands.length).toEqual(6);
    expect(morph.commands[0]).toEqual(PathCommand.MOVE_TO);
    for (let i = 1; i < 5; i += 1) {
      expect(morph.commands[i]).toEqual(PathCommand.CUBIC_CURVE_TO);
    }
    expect(morph.commands[5]).toEqual(PathCommand.CLOSE);
    for (let i = 0; i < morph.startData.length; i += 1) {
      if (i % 2 === 0) {
        expect(morph.startData[i]).toEqual(3.0);
      } else {
        expect(morph.startData[i]).toEqual(4.0);
      }
    }
  });
  it('expands point contour into degenerate cubics', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 3.0, 4.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 0.0, 0.0);
    appendPathLineTo(end, 10.0, 0.0);
    const morph = createPathMorph(start, end)!;
    expect(morph.startData).toEqual([3.0, 4.0, 3.0, 4.0, 3.0, 4.0, 3.0, 4.0]);
  });
  it('normalizes consistently reversed closed endpoint', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 10.0, 10.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 0.0, 0.0);
    appendPathLineTo(end, 0.0, 10.0);
    appendPathLineTo(end, 10.0, 10.0);
    appendPathLineTo(end, 10.0, 0.0);
    appendPathClose(end);
    const morph = createPathMorph(start, end)!;
    for (let i = 0; i < morph.startData.length; i += 1) {
      expect(Math.abs(morph.startData[i] - morph.endData[i]) < 0.005).toBe(true);
    }
  });
  it('normalizes opposing contours independently under even odd', () => {
    let start = createPath('nonZero');
    start.winding = 'evenOdd';
    appendPathRectangle(start, 0.0, 0.0, 20.0, 20.0);
    appendPathRectangle(start, 5.0, 5.0, 10.0, 10.0);
    let end = createPath('nonZero');
    end.winding = 'evenOdd';
    appendPathRectangle(end, 0.0, 0.0, 20.0, 20.0);
    appendPathMoveTo(end, 5.0, 5.0);
    appendPathLineTo(end, 5.0, 15.0);
    appendPathLineTo(end, 15.0, 15.0);
    appendPathLineTo(end, 15.0, 5.0);
    appendPathClose(end);
    const morph = createPathMorph(start, end)!;
    for (let i = 0; i < morph.startData.length; i += 1) {
      expect(Math.abs(morph.startData[i] - morph.endData[i]) < 0.005).toBe(true);
    }
  });
  it('normalizes wide move and line commands', () => {
    let start = createPath('nonZero');
    start.commands.push(PathCommand.WIDE_MOVE_TO);
    start.data.push(99.0);
    start.data.push(98.0);
    start.data.push(1.0);
    start.data.push(2.0);
    start.commands.push(PathCommand.WIDE_LINE_TO);
    start.data.push(97.0);
    start.data.push(96.0);
    start.data.push(7.0);
    start.data.push(8.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 1.0, 2.0);
    appendPathLineTo(end, 7.0, 8.0);
    const morph = createPathMorph(start, end)!;
    expect(morph.startData).toEqual(morph.endData);
    expect(morph.startData).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]);
  });
  it('prepares a closed line rectangle against a closed cubic circle', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, -10.0, -10.0, 20.0, 20.0);
    let end = createPath('nonZero');
    appendPathCircle(end, 0.0, 0.0, 10.0);
    const morph = createPathMorph(start, end)!;
    expect(morph.commands.length).toEqual(6);
    expect(morph.commands[0]).toEqual(PathCommand.MOVE_TO);
    for (let i = 1; i < 5; i += 1) {
      expect(morph.commands[i]).toEqual(PathCommand.CUBIC_CURVE_TO);
    }
    expect(morph.commands[5]).toEqual(PathCommand.CLOSE);
  });
  it('subdivides lower segment count without changing endpoint geometry', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    appendPathLineTo(start, 10.0, 0.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 0.0, 0.0);
    appendPathLineTo(end, 5.0, 0.0);
    appendPathLineTo(end, 10.0, 0.0);
    const morph = createPathMorph(start, end)!;
    expect(morph.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO, PathCommand.CUBIC_CURVE_TO]);
    for (let i = 0; i < morph.startData.length; i += 1) {
      expect(Math.abs(morph.startData[i] - morph.endData[i]) < 0.005).toBe(true);
    }
    const lastTwo = morph.startData.slice(morph.startData.length - 2);
    expect(lastTwo).toEqual([10.0, 0.0]);
  });
});

describe('samplePathMorph', () => {
  // Rust-only: reuses output command and data storage across samples
  it('samples at zero and one', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 2.0);
    appendPathLineTo(start, 6.0, 8.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 10.0, 12.0);
    appendPathQuadraticCurveTo(end, 14.0, 20.0, 18.0, 16.0);
    const morph = createPathMorph(start, end)!;
    let out = createPath('nonZero');
    samplePathMorph(out, morph, 0.0);
    expect(out.data).toEqual(morph.startData);
    samplePathMorph(out, morph, 1.0);
    expect(out.data).toEqual(morph.endData);
  });
  it('copies endpoint coordinates exactly', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, -255_815_156_688.713_68, 12.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 0.000_030_389_885_488_608_44, -24.0);
    const morph = createPathMorph(start, end)!;
    let out = createPath('nonZero');
    samplePathMorph(out, morph, 0.0);
    expect(out.data).toEqual(morph.startData);
    samplePathMorph(out, morph, 1.0);
    expect(out.data).toEqual(morph.endData);
  });
  it('writes midpoint and winding into existing path', () => {
    let start = createPath('nonZero');
    start.winding = 'evenOdd';
    appendPathMoveTo(start, 0.0, 0.0);
    appendPathLineTo(start, 6.0, 0.0);
    let end = createPath('nonZero');
    end.winding = 'evenOdd';
    appendPathMoveTo(end, 2.0, 2.0);
    appendPathQuadraticCurveTo(end, 5.0, 8.0, 8.0, 2.0);
    const morph = createPathMorph(start, end)!;
    let out = createPath('nonZero');
    samplePathMorph(out, morph, 0.5);
    expect(out.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO]);
    expect(out.data).toEqual([1.0, 1.0, 3.0, 3.0, 5.0, 3.0, 7.0, 1.0]);
    expect(out.winding).toEqual('evenOdd');
  });
  it('permits progress outside zero to one for easing overshoot', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 10.0, 20.0);
    const morph = createPathMorph(start, end)!;
    let out = createPath('nonZero');
    samplePathMorph(out, morph, 1.5);
    expect(out.data).toEqual([15.0, 30.0]);
  });
  it('samples empty path pair', () => {
    const start = createPath('nonZero');
    const end = createPath('nonZero');
    const morph = createPathMorph(start, end)!;
    let out = createPath('nonZero');
    samplePathMorph(out, morph, 0.5);
    expect(out.commands.length === 0).toBe(true);
    expect(out.data.length === 0).toBe(true);
  });
  it('interpolates at half', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 100.0, 100.0);
    let end = createPath('nonZero');
    appendPathRectangle(end, 100.0, 100.0, 100.0, 100.0);
    const morph = createPathMorph(start, end)!;
    let out = createPath('nonZero');
    samplePathMorph(out, morph, 0.5);
    for (let i = 0; i < out.data.length; i += 1) {
      const expected = morph.startData[i] + (morph.endData[i] - morph.startData[i]) * 0.5;
      expect(Math.abs(out.data[i] - expected) < 0.001).toBe(true);
    }
  });
});
