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

function square(): RivePathRecord {
  return {
    commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO],
    data: [0, 0, 10, 0],
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
  return { objects, parentIndices: parents ?? objects.map((_value, index) => (index === 0 ? -1 : 0)) };
}
