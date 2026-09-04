import { PathCommand } from '@flighthq/types/contract';

import {
  appendPathClose,
  appendPathCircle,
  appendPathCubicCurveTo,
  appendPathCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  createPath,
} from './path';
import { createPathMorph, initializePathMorph, samplePathMorph } from './pathMorph';

describe('createPathMorph', () => {
  it('normalizes different line and quadratic verbs to one cubic command stream', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 6, 0);
    const end = createPath();
    appendPathMoveTo(end, 2, 2);
    appendPathCurveTo(end, 5, 8, 8, 2);

    const morph = createPathMorph(start, end)!;

    expect(morph.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO]);
    expect(morph.startData).toStrictEqual([0, 0, 2, 0, 4, 0, 6, 0]);
    expect(morph.endData).toStrictEqual([2, 2, 4, 6, 6, 6, 8, 2]);
  });

  it('preserves authored cubic control points', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 9, 0);
    const end = createPath();
    appendPathMoveTo(end, 1, 2);
    appendPathCubicCurveTo(end, 3, 4, 6, 8, 10, 12);

    const morph = createPathMorph(start, end)!;

    expect(morph.endData).toStrictEqual([1, 2, 3, 4, 6, 8, 10, 12]);
  });

  it('subdivides the lower segment count without changing its endpoint geometry', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 10, 0);
    const end = createPath();
    appendPathMoveTo(end, 0, 0);
    appendPathLineTo(end, 5, 0);
    appendPathLineTo(end, 10, 0);

    const morph = createPathMorph(start, end)!;

    expect(morph.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO, PathCommand.CUBIC_CURVE_TO]);
    for (let i = 0; i < morph.startData.length; i++) {
      expect(morph.startData[i]).toBeCloseTo(morph.endData[i]);
    }
    expect(morph.startData.slice(-2)).toStrictEqual([10, 0]);
  });

  it('aligns equivalent closed contours authored from different starting vertices', () => {
    const start = createPath();
    appendPathRectangle(start, 0, 0, 10, 10);
    const end = createPath();
    appendPathMoveTo(end, 10, 0);
    appendPathLineTo(end, 10, 10);
    appendPathLineTo(end, 0, 10);
    appendPathLineTo(end, 0, 0);
    appendPathClose(end);

    const morph = createPathMorph(start, end)!;

    expect(morph.startData).toEqual(morph.endData);
    expect(morph.commands[morph.commands.length - 1]).toBe(PathCommand.CLOSE);
  });

  it('prepares a closed line rectangle against a closed cubic circle', () => {
    const start = createPath();
    appendPathRectangle(start, -10, -10, 20, 20);
    const end = createPath();
    appendPathCircle(end, 0, 0, 10);

    const morph = createPathMorph(start, end)!;

    expect(morph.commands).toStrictEqual([
      PathCommand.MOVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CLOSE,
    ]);
  });

  it('normalizes wide move and line commands without retaining their dummy coordinates', () => {
    const start = createPath();
    start.commands.push(PathCommand.WIDE_MOVE_TO, PathCommand.WIDE_LINE_TO);
    start.data.push(99, 98, 1, 2, 97, 96, 7, 8);
    const end = createPath();
    appendPathMoveTo(end, 1, 2);
    appendPathLineTo(end, 7, 8);

    const morph = createPathMorph(start, end)!;

    expect(morph.startData).toEqual(morph.endData);
    expect(morph.startData).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('expands a point contour into degenerate cubics when the other endpoint has segments', () => {
    const start = createPath();
    appendPathMoveTo(start, 3, 4);
    const end = createPath();
    appendPathMoveTo(end, 0, 0);
    appendPathLineTo(end, 10, 0);

    const morph = createPathMorph(start, end)!;

    expect(morph.startData).toStrictEqual([3, 4, 3, 4, 3, 4, 3, 4]);
  });

  it('expands a closed point contour without inventing an orientation', () => {
    const start = createPath();
    appendPathMoveTo(start, 3, 4);
    appendPathClose(start);
    const end = createPath();
    appendPathRectangle(end, 0, 0, 10, 10);

    const morph = createPathMorph(start, end)!;

    expect(morph.commands).toStrictEqual([
      PathCommand.MOVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CLOSE,
    ]);
    expect(morph.startData.every((value, index) => value === (index % 2 === 0 ? 3 : 4))).toBe(true);
  });

  it('does not mutate either endpoint', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 10, 0);
    const end = createPath();
    appendPathMoveTo(end, 0, 0);
    appendPathLineTo(end, 5, 5);
    appendPathLineTo(end, 10, 0);
    const startCommands = start.commands.slice();
    const startData = start.data.slice();
    const endCommands = end.commands.slice();
    const endData = end.data.slice();

    createPathMorph(start, end);

    expect(start.commands).toStrictEqual(startCommands);
    expect(start.data).toStrictEqual(startData);
    expect(end.commands).toStrictEqual(endCommands);
    expect(end.data).toStrictEqual(endData);
  });

  it('returns null for paths with incompatible topology', () => {
    const start = createPath('nonZero');
    const end = createPath('evenOdd');
    expect(createPathMorph(start, end)).toBeNull();
  });

  it('normalizes a consistently reversed closed endpoint', () => {
    const start = createPath();
    appendPathRectangle(start, 0, 0, 10, 10);
    const end = createPath();
    appendPathMoveTo(end, 0, 0);
    appendPathLineTo(end, 0, 10);
    appendPathLineTo(end, 10, 10);
    appendPathLineTo(end, 10, 0);
    appendPathClose(end);

    const morph = createPathMorph(start, end)!;

    for (let i = 0; i < morph.startData.length; i++) {
      expect(morph.startData[i]).toBeCloseTo(morph.endData[i]);
    }
  });

  it('normalizes opposing contours independently under even-odd winding', () => {
    const start = createPath('evenOdd');
    appendPathRectangle(start, 0, 0, 20, 20);
    appendPathRectangle(start, 5, 5, 10, 10);
    const end = createPath('evenOdd');
    appendPathRectangle(end, 0, 0, 20, 20);
    appendPathMoveTo(end, 5, 5);
    appendPathLineTo(end, 5, 15);
    appendPathLineTo(end, 15, 15);
    appendPathLineTo(end, 15, 5);
    appendPathClose(end);

    const morph = createPathMorph(start, end)!;

    for (let i = 0; i < morph.startData.length; i++) {
      expect(morph.startData[i]).toBeCloseTo(morph.endData[i]);
    }
  });
});

describe('initializePathMorph', () => {
  it('is the construction initializer of createPathMorph', () => {
    expect(typeof initializePathMorph).toBe('function');
  });
});
describe('samplePathMorph', () => {
  it('samples the prepared endpoints at zero and one', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 2);
    appendPathLineTo(start, 6, 8);
    const end = createPath();
    appendPathMoveTo(end, 10, 12);
    appendPathCurveTo(end, 14, 20, 18, 16);
    const morph = createPathMorph(start, end)!;
    const out = createPath();

    samplePathMorph(out, morph, 0);
    expect(out.data).toStrictEqual(morph.startData);
    samplePathMorph(out, morph, 1);
    expect(out.data).toStrictEqual(morph.endData);
  });

  it('copies endpoint coordinates exactly instead of reconstructing them arithmetically', () => {
    const start = createPath();
    appendPathMoveTo(start, -255_815_156_688.713_68, 12);
    const end = createPath();
    appendPathMoveTo(end, 0.000_030_389_885_488_608_44, -24);
    const morph = createPathMorph(start, end)!;
    const out = createPath();

    samplePathMorph(out, morph, 0);
    expect(out.data).toStrictEqual(morph.startData);
    samplePathMorph(out, morph, 1);
    expect(out.data).toStrictEqual(morph.endData);
  });

  it('writes the midpoint and winding into an existing path', () => {
    const start = createPath('evenOdd');
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 6, 0);
    const end = createPath('evenOdd');
    appendPathMoveTo(end, 2, 2);
    appendPathCurveTo(end, 5, 8, 8, 2);
    const out = createPath('nonZero');

    samplePathMorph(out, createPathMorph(start, end)!, 0.5);

    expect(out.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO]);
    expect(out.data).toStrictEqual([1, 1, 3, 3, 5, 3, 7, 1]);
    expect(out.winding).toBe('evenOdd');
  });

  it('reuses the output command and data arrays across samples', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 10, 0);
    const end = createPath();
    appendPathMoveTo(end, 10, 10);
    appendPathLineTo(end, 20, 10);
    const morph = createPathMorph(start, end)!;
    const out = createPath();
    const commands = out.commands;
    const data = out.data;

    samplePathMorph(out, morph, 0.25);
    samplePathMorph(out, morph, 0.75);

    expect(out.commands).toBe(commands);
    expect(out.data).toBe(data);
  });

  it('permits progress outside zero to one for easing overshoot', () => {
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    const end = createPath();
    appendPathMoveTo(end, 10, 20);
    const out = createPath();

    samplePathMorph(out, createPathMorph(start, end)!, 1.5);

    expect(out.data).toStrictEqual([15, 30]);
  });

  it('samples an empty path pair', () => {
    const out = createPath();
    samplePathMorph(out, createPathMorph(createPath(), createPath())!, 0.5);
    expect(out.commands).toStrictEqual([]);
    expect(out.data).toStrictEqual([]);
  });
});
