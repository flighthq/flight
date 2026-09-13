import type { ShapeCommandToken } from '@flighthq/types/contract';

import { createScale9Shape } from './scale9Shape';
import { mapScale9ShapeCommands } from './scale9ShapeCommands';
import { appendShapeBeginFill, appendShapeRectangle } from './shapeCommands';

const grid = { x: 10, y: 10, width: 80, height: 80 };

describe('mapScale9ShapeCommands', () => {
  const out: ShapeCommandToken[] = [];

  it('passes style commands through unchanged', () => {
    const mapper = { mapX: (x: number) => x, mapY: (y: number) => y };
    mapScale9ShapeCommands(out, ['beginFill', 2, 0xff0000ff, 1], mapper);
    expect(out).toEqual(['beginFill', 2, 0xff0000ff, 1]);
  });

  it('remaps moveTo coordinates', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 3 };
    mapScale9ShapeCommands(out, ['moveTo', 2, 10, 20], mapper);
    expect(out).toEqual(['moveTo', 2, 20, 60]);
  });

  it('remaps lineTo coordinates', () => {
    const mapper = { mapX: (x: number) => x + 5, mapY: (y: number) => y + 10 };
    mapScale9ShapeCommands(out, ['lineTo', 2, 100, 50], mapper);
    expect(out).toEqual(['lineTo', 2, 105, 60]);
  });

  it('remaps drawRectangle corners and recomputes size', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    mapScale9ShapeCommands(out, ['drawRectangle', 4, 10, 20, 50, 30], mapper);
    // x=10Ã¢â€ â€™20, y=20Ã¢â€ â€™40, x+w=60Ã¢â€ â€™120 (w=100), y+h=50Ã¢â€ â€™100 (h=60)
    expect(out).toEqual(['drawRectangle', 4, 20, 40, 100, 60]);
  });

  it('remaps drawRoundedRectangle corners but leaves its radius unchanged', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    mapScale9ShapeCommands(out, ['drawRoundedRectangle', 5, 10, 20, 50, 30, 20], mapper);
    expect(out).toEqual(['drawRoundedRectangle', 5, 20, 40, 100, 60, 20]);
  });

  it('remaps drawCircle center but leaves radius unchanged', () => {
    const mapper = { mapX: (x: number) => x + 5, mapY: (y: number) => y + 10 };
    mapScale9ShapeCommands(out, ['drawCircle', 3, 50, 50, 25], mapper);
    expect(out).toEqual(['drawCircle', 3, 55, 60, 25]);
  });

  it('remaps drawEllipse extrema and recomputes its center and radii', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    mapScale9ShapeCommands(out, ['drawEllipse', 4, 50, 25, 50, 25], mapper);
    expect(out).toEqual(['drawEllipse', 4, 100, 50, 100, 50]);
  });

  it('remaps quadratic and cubic controls plus endpoints', () => {
    const mapper = { mapX: (x: number) => x + 1, mapY: (y: number) => y + 2 };
    mapScale9ShapeCommands(out, ['quadraticCurveTo', 4, 10, 20, 30, 40], mapper);
    expect(out).toEqual(['quadraticCurveTo', 4, 11, 22, 31, 42]);

    mapScale9ShapeCommands(out, ['cubicCurveTo', 6, 1, 2, 3, 4, 5, 6], mapper);
    expect(out).toEqual(['cubicCurveTo', 6, 2, 4, 4, 6, 6, 8]);
  });

  it('returns a buffer with the same element count as the input', () => {
    const shape = createScale9Shape(grid);
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    // A mapper is any pair of coordinate functions; building one from a grid is a renderer's job, and
    // the rewrite under test does not care where the mapping came from.
    mapScale9ShapeCommands(out, shape.data.commands, { mapX: (x) => x * 2, mapY: (y) => y * 2 });
    expect(out).toHaveLength(shape.data.commands.length);
  });
});
