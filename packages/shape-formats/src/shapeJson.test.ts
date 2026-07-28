import { createMatrix } from '@flighthq/geometry/contract';
import {
  appendShapeBeginTextureFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeEndFill,
  appendShapeLineStyle,
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
    expect(parsed.shapeFormat).toBe(2);
    expect(Array.isArray(parsed.commands)).toBe(true);
    expect(parsed.commands[0]).toEqual({ key: 'beginFill', args: [0x112233ff, 1] });
  });

  it('serializes a matrix argument as its {a,b,c,d,tx,ty} fields', () => {
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'radial', [0], [1], [0], createMatrix(2, 0, 0, 3, 5, 7), 'pad', 'rgb', 0);
    const parsed = JSON.parse(formatShapeJson(shape));
    expect(parsed.commands[0].args[4]).toEqual({ a: 2, b: 0, c: 0, d: 3, tx: 5, ty: 7 });
  });

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
    expect(parseShapeJson(JSON.stringify({ shapeFormat: 3, commands: [] }))).toBeNull();
  });

  it('returns null when the top level is not an object', () => {
    expect(parseShapeJson(JSON.stringify([]))).toBeNull();
  });

  it('returns null for an unknown command key', () => {
    const json = JSON.stringify({ shapeFormat: 2, commands: [{ key: 'notACommand', args: [] }] });
    expect(parseShapeJson(json)).toBeNull();
  });

  it('returns null for a malformed argument object', () => {
    const json = JSON.stringify({ shapeFormat: 2, commands: [{ key: 'beginFill', args: [{ nonsense: true }, 1] }] });
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
