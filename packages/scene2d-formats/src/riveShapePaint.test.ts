import { createPath, getPathLength } from '@flighthq/path/contract';
import { createShape } from '@flighthq/shape/contract';
import type { RiveArtboardGraph, RiveCoreObject, RivePathRecord } from '@flighthq/types/contract';
import { PathCommand, RiveFieldType } from '@flighthq/types/contract';

import { appendRiveShapePaint } from './riveShapePaint';

// A Rive shape states a LIST of paints and each one covers every path of that shape. Modelling it as
// one slot per kind is the bug that had to be retrofitted out of the Lottie importer, so these cases
// pin the list behaviour rather than assuming it.

const SHAPE = 3;
const RADIAL_GRADIENT = 17;
const SOLID_COLOR = 18;
const GRADIENT_STOP = 19;
const FILL = 20;
const LINEAR_GRADIENT = 22;
const STROKE = 24;
const TRIM_PATH = 47;

describe('appendRiveShapePaint', () => {
  it('draws nothing when the shape has no paths', () => {
    const shape = createShape();
    appendRiveShapePaint(shape, graph([object(SHAPE, {})]), 0, []);

    expect(shape.data.commands).toEqual([]);
  });

  it('emits the geometry even when the shape states no paint', () => {
    const shape = createShape();
    appendRiveShapePaint(shape, graph([object(SHAPE, {})]), 0, [square()]);

    expect(paintTokens(shape)).toEqual([]);
    expect(drawCount(shape)).toBe(1);
  });

  it('unpacks a solid colour from the ARGB the format states', () => {
    const shape = createShape();
    // 0x80ff8040: alpha 0x80, red 0xff, green 0x80, blue 0x40.
    appendRiveShapePaint(
      shape,
      graph([object(SHAPE, {}), object(FILL, {}), object(SOLID_COLOR, { 37: 0x80ff8040 })], [-1, 0, 1]),
      0,
      [square()],
    );
    const tokens = shape.data.commands as unknown[];
    const at = tokens.indexOf('beginFill');

    expect(tokens[at + 2]).toBe(0xff8040);
    expect(tokens[at + 3]).toBeCloseTo(0x80 / 255, 6);
  });

  it('falls back to the colour the format states when a solid colour omits it', () => {
    const shape = createShape();
    appendRiveShapePaint(shape, graph([object(SHAPE, {}), object(FILL, {}), object(SOLID_COLOR, {})], [-1, 0, 1]), 0, [
      square(),
    ]);
    const tokens = shape.data.commands as unknown[];

    expect(tokens[tokens.indexOf('beginFill') + 2]).toBe(0x747474);
  });

  it('keeps every paint a shape states, in the order it states them', () => {
    const shape = createShape();
    appendRiveShapePaint(
      shape,
      graph(
        [
          object(SHAPE, {}),
          object(STROKE, { 47: 4 }),
          object(SOLID_COLOR, { 37: 0xff00ff00 }),
          object(FILL, {}),
          object(SOLID_COLOR, { 37: 0xffff0000 }),
          object(FILL, {}),
          object(SOLID_COLOR, { 37: 0xff0000ff }),
        ],
        [-1, 0, 1, 0, 3, 0, 5],
      ),
      0,
      [square()],
    );

    // A stroke then two fills: three paints, none collapsed into another.
    expect(paintTokens(shape)).toEqual(['lineStyle', 'beginFill', 'beginFill']);
    expect(drawCount(shape)).toBe(3);
  });

  it('restates every path under every paint', () => {
    const shape = createShape();
    appendRiveShapePaint(
      shape,
      graph(
        [object(SHAPE, {}), object(FILL, {}), object(SOLID_COLOR, {}), object(FILL, {}), object(SOLID_COLOR, {})],
        [-1, 0, 1, 0, 3],
      ),
      0,
      [square(), square()],
    );

    // Two paths under two paints.
    expect(drawCount(shape)).toBe(4);
  });

  it('skips a paint the file marks invisible', () => {
    const shape = createShape();
    appendRiveShapePaint(
      shape,
      graph([object(SHAPE, {}), object(FILL, { 41: 0 }), object(SOLID_COLOR, {})], [-1, 0, 1]),
      0,
      [square()],
    );

    expect(paintTokens(shape)).toEqual([]);
  });

  it('reads a fill rule of 1 as even-odd', () => {
    const nonZero = createShape();
    const evenOdd = createShape();
    appendRiveShapePaint(nonZero, graph([object(SHAPE, {}), object(FILL, { 40: 0 })], [-1, 0]), 0, [square()]);
    appendRiveShapePaint(evenOdd, graph([object(SHAPE, {}), object(FILL, { 40: 1 })], [-1, 0]), 0, [square()]);

    expect(windingOf(nonZero)).toBe('nonZero');
    expect(windingOf(evenOdd)).toBe('evenOdd');
  });

  it('builds a gradient from its stops, scaling each stop alpha by the gradient opacity', () => {
    const shape = createShape();
    appendRiveShapePaint(
      shape,
      graph(
        [
          object(SHAPE, {}),
          object(FILL, {}),
          object(LINEAR_GRADIENT, { 42: 0, 33: 0, 34: 100, 35: 0, 46: 0.5 }),
          object(GRADIENT_STOP, { 38: 0xffff0000, 39: 0 }),
          object(GRADIENT_STOP, { 38: 0x800000ff, 39: 1 }),
        ],
        [-1, 0, 1, 2, 2],
      ),
      0,
      [square()],
    );
    const tokens = shape.data.commands as unknown[];
    const at = tokens.indexOf('beginGradientFill');

    expect(tokens[at + 2]).toBe('linear');
    expect(tokens[at + 3]).toEqual([0xff0000, 0x0000ff]);
    // Stop alpha times the gradient's own opacity, and Flight states the ratio out of 255.
    expect((tokens[at + 4] as number[])[0]).toBeCloseTo(0.5, 6);
    expect((tokens[at + 4] as number[])[1]).toBeCloseTo((0x80 / 255) * 0.5, 6);
    expect(tokens[at + 5]).toEqual([0, 255]);
  });

  it('marks a radial gradient as radial', () => {
    const shape = createShape();
    appendRiveShapePaint(
      shape,
      graph(
        [object(SHAPE, {}), object(FILL, {}), object(RADIAL_GRADIENT, { 34: 10 }), object(GRADIENT_STOP, { 39: 0 })],
        [-1, 0, 1, 2],
      ),
      0,
      [square()],
    );
    const tokens = shape.data.commands as unknown[];

    expect(tokens[tokens.indexOf('beginGradientFill') + 2]).toBe('radial');
  });

  // A trim states its span as fractions of length, so the honest check is the LENGTH that survives:
  // trimming to a third must leave a third. That is the format's own relation, not the dash
  // arithmetic used to produce it.
  it('leaves the fraction of stroke length the trim states', () => {
    for (const [start, end, expected] of [
      [0, 1, 1],
      [0, 0.5, 0.5],
      [0.25, 0.75, 0.5],
      [0, 0.25, 0.25],
    ] as const) {
      const shape = createShape();
      appendRiveShapePaint(shape, trimmedStroke(start, end, 2), 0, [line(100)]);

      expect(strokedLength(shape)).toBeCloseTo(expected * 100, 1);
    }
  });

  // The two modes keep the same TOTAL length, so only the distribution separates them: sequential
  // consumes the run in order and leaves the later path untouched, while synchronized takes the same
  // proportion out of each.
  it('consumes a sequential trim in run order, leaving later paths empty', () => {
    const shape = createShape();
    appendRiveShapePaint(shape, trimmedStroke(0, 0.5, 1), 0, [line(150), line(50)]);
    const lengths = strokedLengths(shape);

    expect(lengths.filter((value) => value > 0.001)).toHaveLength(1);
    expect(Math.max(...lengths)).toBeCloseTo(100, 0);
  });

  it('takes the same proportion out of every path when synchronized', () => {
    const shape = createShape();
    appendRiveShapePaint(shape, trimmedStroke(0, 0.5, 2), 0, [line(150), line(50)]);
    const lengths = strokedLengths(shape)
      .filter((value) => value > 0.001)
      .sort((a, b) => a - b);

    expect(lengths).toHaveLength(2);
    expect(lengths[0]).toBeCloseTo(25, 0);
    expect(lengths[1]).toBeCloseTo(75, 0);
  });

  // A span that runs off the end wraps to the front, which is how a trim animates continuously
  // around a closed shape. Clipping instead of wrapping silently shortens it.
  it('wraps a span that runs past the end back to the front', () => {
    const shape = createShape();
    appendRiveShapePaint(shape, trimmedStroke(0.8, 1.1, 2), 0, [line(100)]);

    // 30% of the length, as two pieces: 20 units at the end and 10 at the start.
    expect(strokedLength(shape)).toBeCloseTo(30, 0);
    expect(strokedLengths(shape).filter((value) => value > 0.001)).toHaveLength(2);
  });

  it('drops the stroke entirely when the trim span is empty', () => {
    const shape = createShape();
    appendRiveShapePaint(shape, trimmedStroke(0.5, 0.5, 2), 0, [line(100)]);

    expect(strokedLength(shape)).toBeCloseTo(0, 3);
  });

  it('leaves a fill untouched by a trim that belongs to a stroke', () => {
    const shape = createShape();
    const graphWithBoth = graph(
      [
        object(SHAPE, {}),
        object(FILL, {}),
        object(SOLID_COLOR, {}),
        object(STROKE, {}),
        object(TRIM_PATH, { 114: 0, 115: 0.5, 117: 2 }),
      ],
      [-1, 0, 1, 0, 3],
    );
    appendRiveShapePaint(shape, graphWithBoth, 0, [line(100)]);

    // The fill draws the whole path and the stroke draws half of it.
    expect(strokedLength(shape)).toBeCloseTo(150, 0);
  });

  it('carries stroke thickness, cap and join', () => {
    const shape = createShape();
    appendRiveShapePaint(
      shape,
      graph([object(SHAPE, {}), object(STROKE, { 47: 7, 48: 1, 49: 2 }), object(SOLID_COLOR, {})], [-1, 0, 1]),
      0,
      [square()],
    );
    const tokens = shape.data.commands as unknown[];
    const at = tokens.indexOf('lineStyle');

    expect(tokens[at + 2]).toBe(7);
    expect(tokens[at + 6]).toBe('normal');
    expect(tokens[at + 7]).toBe('round');
    expect(tokens[at + 8]).toBe('bevel');
  });
});

function strokedLengths(shape: { data: { commands: unknown[] } }): number[] {
  const tokens = shape.data.commands;
  const lengths: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'drawPath') continue;
    const path = createPath();
    for (const c of tokens[i + 2] as number[]) path.commands.push(c);
    for (const d of tokens[i + 3] as number[]) path.data.push(d);
    lengths.push(getPathLength(path));
  }
  return lengths;
}

function strokedLength(shape: { data: { commands: unknown[] } }): number {
  // Total length of everything drawn under the stroke, measured from the emitted geometry.
  const tokens = shape.data.commands;
  let total = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'drawPath') continue;
    const path = createPath();
    for (const c of tokens[i + 2] as number[]) path.commands.push(c);
    for (const d of tokens[i + 3] as number[]) path.data.push(d);
    total += getPathLength(path);
  }
  return total;
}

function paintTokens(shape: { data: { commands: unknown[] } }): string[] {
  const starts = ['beginFill', 'beginGradientFill', 'lineStyle', 'lineGradientStyle'];
  return shape.data.commands.filter((token): token is string => typeof token === 'string' && starts.includes(token));
}

function drawCount(shape: { data: { commands: unknown[] } }): number {
  return shape.data.commands.filter((token) => token === 'drawPath').length;
}

function windingOf(shape: { data: { commands: unknown[] } }): unknown {
  const tokens = shape.data.commands;
  return tokens[tokens.indexOf('drawPath') + 4];
}

function trimmedStroke(start: number, end: number, mode: number) {
  return graph(
    [
      object(SHAPE, {}),
      object(STROKE, {}),
      object(SOLID_COLOR, {}),
      object(TRIM_PATH, { 114: start, 115: end, 117: mode }),
    ],
    [-1, 0, 1, 1],
  );
}

function line(length: number): RivePathRecord {
  return {
    commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO],
    data: [0, 0, length, 0],
    pathIndex: 0,
    winding: 'nonZero',
  };
}

function square(): RivePathRecord {
  return {
    commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO],
    data: [0, 0, 10, 0],
    pathIndex: 0,
    winding: 'nonZero',
  };
}

function object(typeKey: number, properties: Readonly<Record<number, number>>): RiveCoreObject {
  return {
    properties: Object.entries(properties).map(([key, value]) => ({
      key: Number(key),
      type: RiveFieldType.Double,
      value,
    })),
    typeKey,
  };
}

function graph(objects: RiveCoreObject[], parents?: number[]): RiveArtboardGraph {
  return {
    objects,
    parentIndices: parents ?? objects.map((_value, index) => (index === 0 ? -1 : 0)),
    streamEnd: objects.length,
    streamStart: 0,
  };
}
