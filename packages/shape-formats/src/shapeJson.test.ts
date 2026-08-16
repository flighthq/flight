import { createMatrix } from '@flighthq/geometry/contract';
import {
  appendShapeBeginTextureFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeDrawTriangles,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTextureStyle,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  createShape,
  getShapeCommandCount,
} from '@flighthq/shape/contract';
import type { Texture } from '@flighthq/types/contract';

import { formatShapeJson, parseShapeJson } from './shapeJson';

function createEveryNonBitmapCommandShape() {
  const shape = createShape();
  appendShapeBeginFill(shape, 0xff0000ff, 1);
  appendShapeBeginGradientFill(
    shape,
    'linear',
    [0xff0000ff, 0x0000ffff],
    [1, 0.5],
    [0, 255],
    createMatrix(1, 0, 0, 1, 10, 20),
    'pad',
    'rgb',
    0,
  );
  appendShapeLineStyle(shape, 2, 0x00ff00ff, 1, false, 'normal', 'round', 'miter', 3);
  appendShapeMoveTo(shape, 0, 0);
  appendShapeLineTo(shape, 100, 0);
  appendShapeCurveTo(shape, 150, 50, 100, 100);
  appendShapeCubicCurveTo(shape, 10, 10, 20, 20, 30, 30);
  appendShapePath(shape, [1, 2], [0, 0, 50, 50], 'evenOdd');
  appendShapeCircle(shape, 5, 6, 7);
  appendShapeEllipse(shape, 1, 2, 3, 4);
  appendShapeRectangle(shape, 10, 11, 12, 13);
  appendShapeRoundRectangle(shape, 1, 2, 3, 4, 5, 6);
  appendShapeDrawTriangles(shape, [0, 0, 1, 0, 0, 1], [0, 1, 2], [0, 0, 1, 0, 0, 1], 'positive');
  appendShapeDrawTriangles(shape, [0, 0, 1, 0, 0, 1], null, null, 'none');
  appendShapeLineGradientStyle(
    shape,
    'radial',
    [0x112233ff, 0x445566ff],
    [1, 0],
    [0, 255],
    null,
    'reflect',
    'linearRGB',
    0.5,
  );
  appendShapeEndFill(shape);
  return shape;
}

// A minimal stand-in for a live Texture; the codec never inspects texture internals, only
// swaps the object for an ordinal reference and back.
function createFakeTexture(): Texture {
  return {} as Texture;
}

describe('formatShapeJson', () => {
  it('wraps the command stream in a versioned top-level object', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0x112233ff, 1);
    const parsed = JSON.parse(formatShapeJson(shape));
    expect(parsed.shapeFormat).toBe(3);
    expect(Array.isArray(parsed.commands)).toBe(true);
    expect(parsed.commands[0]).toEqual({ key: 'beginFill', args: [0x112233ff, 1] });
  });

  it('serializes a matrix argument as its {a,b,c,d,tx,ty} fields', () => {
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'radial', [0], [1], [0], createMatrix(2, 0, 0, 3, 5, 7), 'pad', 'rgb', 0);
    const parsed = JSON.parse(formatShapeJson(shape));
    expect(parsed.commands[0].args[4]).toEqual({ a: 2, b: 0, c: 0, d: 3, tx: 5, ty: 7 });
  });

  it.each(['a', 'b', 'c', 'd', 'tx', 'ty'] as const)(
    'round-trips a large finite %s matrix field and refuses a non-finite one',
    (field) => {
      const shape = createShape();
      const matrix = createMatrix(2, 0, 0, 3, 5, 7);
      matrix[field] = 1e308;
      appendShapeBeginGradientFill(shape, 'radial', [0], [1], [0], matrix, 'pad', 'rgb', 0);

      const text = formatShapeJson(shape);
      const restored = parseShapeJson(text);
      expect(restored).not.toBeNull();
      expect(formatShapeJson(restored!)).toBe(text);

      matrix[field] = Infinity;
      expect(() => formatShapeJson(shape)).toThrow(TypeError);
    },
  );

  it('serializes a texture as an ordinal reference, never the texture', () => {
    const shape = createShape();
    appendShapeBeginTextureFill(shape, createFakeTexture(), null);
    const parsed = JSON.parse(formatShapeJson(shape));
    expect(parsed.commands[0].args[0]).toEqual({ texture: { index: 0 } });
    expect(parsed.commands[0].args[1]).toBeNull();
  });

  it('honors the space option for pretty-printing', () => {
    const shape = createShape();
    appendShapeEndFill(shape);
    expect(formatShapeJson(shape, { space: 2 })).toContain('\n');
  });
});

describe('parseShapeJson', () => {
  it('round-trips every non-texture command losslessly', () => {
    const shape = createEveryNonBitmapCommandShape();
    const json = formatShapeJson(shape);
    const restored = parseShapeJson(json);
    expect(restored).not.toBeNull();
    expect(getShapeCommandCount(restored!)).toBe(getShapeCommandCount(shape));
    expect(formatShapeJson(restored!)).toBe(json);
  });

  it('returns null for malformed JSON', () => {
    expect(parseShapeJson('{ not json')).toBeNull();
  });

  it('returns null for a missing version tag', () => {
    expect(parseShapeJson(JSON.stringify({ commands: [] }))).toBeNull();
  });

  it('returns null for a mismatched version tag', () => {
    expect(parseShapeJson(JSON.stringify({ shapeFormat: 999, commands: [] }))).toBeNull();
  });

  it('returns null when the top level is not an object', () => {
    expect(parseShapeJson(JSON.stringify([]))).toBeNull();
  });

  it('returns null for an unknown command key', () => {
    const json = JSON.stringify({ shapeFormat: 3, commands: [{ key: 'notACommand', args: [] }] });
    expect(parseShapeJson(json)).toBeNull();
  });

  it('returns null for a malformed argument object', () => {
    const json = JSON.stringify({ shapeFormat: 3, commands: [{ key: 'beginFill', args: [{ nonsense: true }, 1] }] });
    expect(parseShapeJson(json)).toBeNull();
  });

  it('round-trips a bitmap fill through the texture resolver', () => {
    const texture = createFakeTexture();
    const shape = createShape();
    appendShapeBeginTextureFill(shape, texture, createMatrix(1, 0, 0, 1, 3, 4));
    appendShapeMoveTo(shape, 5, 6);

    const seen: number[] = [];
    const restored = parseShapeJson(formatShapeJson(shape), {
      resolveTexture: (reference) => {
        seen.push(reference.index);
        return texture;
      },
    });

    expect(restored).not.toBeNull();
    expect(seen).toEqual([0]);
    expect(getShapeCommandCount(restored!)).toBe(2);
    expect(restored!.data.commands[0]).toBe('beginTextureFill');
    expect(restored!.data.commands[2]).toBe(texture);
  });

  it('drops a bitmap fill when no resolver is supplied and keeps the rest intact', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffffff, 1);
    appendShapeBeginTextureFill(shape, createFakeTexture(), null);
    appendShapeLineTo(shape, 9, 9);

    const restored = parseShapeJson(formatShapeJson(shape));
    expect(restored).not.toBeNull();
    expect(getShapeCommandCount(restored!)).toBe(2);
    expect(restored!.data.commands[0]).toBe('beginFill');
    expect(restored!.data.commands[4]).toBe('lineTo');
  });

  it('drops a bitmap fill when the resolver returns null', () => {
    const shape = createShape();
    appendShapeBeginTextureFill(shape, createFakeTexture(), null);
    appendShapeEndFill(shape);

    const restored = parseShapeJson(formatShapeJson(shape), { resolveTexture: () => null });
    expect(restored).not.toBeNull();
    expect(getShapeCommandCount(restored!)).toBe(1);
    expect(restored!.data.commands[0]).toBe('endFill');
  });
});

describe('parseShapeJson argument validation', () => {
  function document(commands: readonly unknown[]): string {
    return JSON.stringify({ shapeFormat: 3, commands });
  }

  // Every rejection below used to build a Shape instead. The parser checked that an entry looked like
  // a command and then spread whatever it found straight into the appender, so a bad document produced
  // corrupt geometry rather than the null its own contract documents.
  it('rejects a command with too few arguments', () => {
    expect(parseShapeJson(document([{ key: 'moveTo', args: [1] }]))).toBeNull();
  });

  it('rejects a command with too many arguments', () => {
    expect(parseShapeJson(document([{ key: 'moveTo', args: [1, 2, 3] }]))).toBeNull();
  });

  it('rejects a string where a number is expected', () => {
    expect(parseShapeJson(document([{ key: 'moveTo', args: ['1', '2'] }]))).toBeNull();
  });

  it('rejects a number where a string is expected', () => {
    expect(parseShapeJson(document([{ key: 'drawPath', args: [[1], [0, 0], 7] }]))).toBeNull();
  });

  it('rejects a number where an array is expected', () => {
    expect(parseShapeJson(document([{ key: 'drawPath', args: [1, [0, 0], 'evenOdd'] }]))).toBeNull();
  });

  it('rejects a non-numeric entry inside a numeric array', () => {
    expect(parseShapeJson(document([{ key: 'drawPath', args: [[1], [0, 'x'], 'evenOdd'] }]))).toBeNull();
  });

  // JSON has no NaN or Infinity literal: a NaN coordinate serializes as `null`, and an out-of-range
  // literal parses back as Infinity. Both silently change the geometry, so both are refused.
  it('rejects a null where a number is expected, which is how NaN survives JSON', () => {
    expect(parseShapeJson(document([{ key: 'moveTo', args: [null, 5] }]))).toBeNull();
  });

  it('rejects an out-of-range literal that parses as Infinity', () => {
    expect(parseShapeJson('{"shapeFormat":2,"commands":[{"key":"moveTo","args":[1e999,2]}]}')).toBeNull();
  });

  it('rejects a non-finite entry inside a numeric array', () => {
    expect(
      parseShapeJson('{"shapeFormat":2,"commands":[{"key":"drawPath","args":[[1],[1e999,0],"evenOdd"]}]}'),
    ).toBeNull();
  });

  it('accepts a command that omits its optional trailing arguments', () => {
    const restored = parseShapeJson(
      document([
        { key: 'lineStyle', args: [] },
        { key: 'endFill', args: [] },
      ]),
    );
    expect(restored).not.toBeNull();
    expect(getShapeCommandCount(restored!)).toBe(2);
  });

  it('accepts a null matrix in an optional matrix position', () => {
    const restored = parseShapeJson(
      document([{ key: 'beginGradientFill', args: ['linear', [1], [1], [0], null, 'pad', 'rgb', 0] }]),
    );
    expect(restored).not.toBeNull();
  });

  it('rejects a non-matrix object in a matrix position', () => {
    expect(
      parseShapeJson(
        document([{ key: 'beginGradientFill', args: ['linear', [1], [1], [0], { a: 1 }, 'pad', 'rgb', 0] }]),
      ),
    ).toBeNull();
  });

  it.each(['a', 'b', 'c', 'd', 'tx', 'ty'])('rejects a non-finite %s matrix field', (field) => {
    const values: Record<string, string> = { a: '1', b: '0', c: '0', d: '1', tx: '2', ty: '3' };
    values[field] = '1e999';
    const matrix = `{${Object.entries(values)
      .map(([key, value]) => `"${key}":${value}`)
      .join(',')}}`;
    const text =
      `{"shapeFormat":2,"commands":[{"key":"beginGradientFill","args":` +
      `["linear",[1],[1],[0],${matrix},"pad","rgb",0]}]}`;

    expect(parseShapeJson(text)).toBeNull();
  });

  it('rejects a matrix field serialized from Infinity to null', () => {
    const text = document([
      {
        key: 'beginGradientFill',
        args: ['linear', [1], [1], [0], { a: Infinity, b: 0, c: 0, d: 1, tx: 2, ty: 3 }, 'pad', 'rgb', 0],
      },
    ]);
    expect(text).toContain('"a":null');
    expect(parseShapeJson(text)).toBeNull();
  });

  // A texture command still drops rather than failing the parse: an unresolved reference is a missing
  // asset, not a malformed document, and that distinction predates this validation.
  it('drops rather than rejects a texture command whose reference does not resolve', () => {
    const shape = createShape();
    appendShapeBeginTextureFill(shape, createFakeTexture(), null);
    appendShapeEndFill(shape);
    const restored = parseShapeJson(formatShapeJson(shape), { resolveTexture: () => null });
    expect(restored).not.toBeNull();
    expect(getShapeCommandCount(restored!)).toBe(1);
  });

  // The two tables are indexed by the same key set and are read together on every command, so a key
  // in the appender table with no arg spec would make its command unparseable — isValidShapeCommandArgs
  // treats a missing spec as invalid. Round-tripping a shape that exercises the whole non-texture
  // vocabulary therefore *is* the consistency check: a forgotten spec turns this null.
  it('parses every command the serializer can emit, proving each has an argument spec', () => {
    const shape = createEveryNonBitmapCommandShape();
    const expected = getShapeCommandCount(shape);
    const restored = parseShapeJson(formatShapeJson(shape));
    expect(restored).not.toBeNull();
    expect(getShapeCommandCount(restored!)).toBe(expected);
  });
});
