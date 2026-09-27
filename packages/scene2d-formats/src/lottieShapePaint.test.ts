import { appendPathRectangle, createPath } from '@flighthq/path/contract';
import { createShape } from '@flighthq/shape/contract';
import { describe, expect, it } from 'vitest';

import { appendLottieDashedShapePaths, appendLottieShapePaths } from './lottieShapePaint.ts';

// ★ THE PAIR EXISTS TO KEEP `dashPath` OUT OF A FILL, so what has to be true is that the plain one is not the dashed one
// with an empty list. Both are asserted against the same square, and the dashed output has to be LONGER — a dashed
// square is four edges cut into segments — because "the dash was applied" is otherwise indistinguishable from "the dash
// was ignored".
describe('appendLottieDashedShapePaths', () => {
  // A `drawPath` entry is five slots — the verb, the argument count, the path's command list, its data, and the winding
  // — so both shapes have `commands.length` 5 whatever the dash does. The segment count lives in the nested command
  // list, which is where the comparison has to look: measured 12 path commands dashed against 5 undashed.
  it('cuts each path into dash segments', () => {
    const shape = createShape();
    appendLottieDashedShapePaths([square()], shape, null, [4, 4], 0);
    const plainShape = createShape();
    appendLottieShapePaths([square()], plainShape, null);
    expect(pathCommandCount(shape)).toBeGreaterThan(pathCommandCount(plainShape));
  });

  it('appends the path untouched when the dash list is empty, which is what an undashed stroke passes', () => {
    const dashedEmpty = createShape();
    appendLottieDashedShapePaths([square()], dashedEmpty, 'evenOdd', [], 0);
    const plain = createShape();
    appendLottieShapePaths([square()], plain, 'evenOdd');
    expect(dashedEmpty.data.commands).toEqual(plain.data.commands);
  });
});

describe('appendLottieShapePaths', () => {
  it('appends every path and lets the paint override the winding', () => {
    const shape = createShape();
    appendLottieShapePaths([square(), square()], shape, 'evenOdd');
    expect(shape.data.commands.filter((entry) => entry === 'drawPath')).toHaveLength(2);
    expect(shape.data.commands).toContain('evenOdd');
    expect(shape.data.commands).not.toContain('nonZero');
  });

  it('falls back to the path own winding when the paint names none', () => {
    const shape = createShape();
    appendLottieShapePaths([square()], shape, null);
    expect(shape.data.commands).toContain('nonZero');
  });
});

function pathCommandCount(shape: ReturnType<typeof createShape>): number {
  return (shape.data.commands[2] as readonly number[]).length;
}

function square() {
  const path = createPath();
  appendPathRectangle(path, 0, 0, 10, 10);
  return path;
}
