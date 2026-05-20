import { beginFill, createScale9Shape, drawRect } from '@flighthq/scenegraph-display';

import { buildScale9Mapper } from './canvasScale9Mapper';
import { remapScale9Commands } from './canvasScale9Shape';
import { defaultCanvasShapeCommands } from './canvasShapeCommands';
import { registerCanvasShapeCommands } from './canvasShapeRegistry';

beforeAll(() => {
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
});

const grid = { x: 10, y: 10, width: 80, height: 80 };

describe('remapScale9Commands', () => {
  it('passes style commands through unchanged', () => {
    const mapper = buildScale9Mapper([], { x: 0, y: 0, width: 100, height: 100 }, 1, 1)!;
    const cmds = [{ key: 'beginFill' as const, args: [0xff0000, 1] as const }];
    const result = remapScale9Commands(cmds, mapper ?? { mapX: (x) => x, mapY: (y) => y });
    expect(result[0]).toEqual(cmds[0]);
  });

  it('remaps moveTo coordinates', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 3 };
    const cmds = [{ key: 'moveTo' as const, args: [10, 20] as const }];
    const result = remapScale9Commands(cmds, mapper);
    expect(result[0]).toEqual({ key: 'moveTo', args: [20, 60] });
  });

  it('remaps lineTo coordinates', () => {
    const mapper = { mapX: (x: number) => x + 5, mapY: (y: number) => y + 10 };
    const cmds = [{ key: 'lineTo' as const, args: [100, 50] as const }];
    const result = remapScale9Commands(cmds, mapper);
    expect(result[0]).toEqual({ key: 'lineTo', args: [105, 60] });
  });

  it('remaps drawRect corners and recomputes size', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    const cmds = [{ key: 'drawRect' as const, args: [10, 20, 50, 30] as const }];
    const result = remapScale9Commands(cmds, mapper);
    // x=10→20, y=20→40, x+w=60→120 (w=100), y+h=50→100 (h=60)
    expect(result[0]).toEqual({ key: 'drawRect', args: [20, 40, 100, 60] });
  });

  it('remaps drawRoundRect corners but leaves ellipse radii unchanged', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    const cmds = [{ key: 'drawRoundRect' as const, args: [10, 20, 50, 30, 8, 8] as const }];
    const result = remapScale9Commands(cmds, mapper);
    expect(result[0]).toEqual({ key: 'drawRoundRect', args: [20, 40, 100, 60, 8, 8] });
  });

  it('remaps drawCircle center but leaves radius unchanged', () => {
    const mapper = { mapX: (x: number) => x + 5, mapY: (y: number) => y + 10 };
    const cmds = [{ key: 'drawCircle' as const, args: [50, 50, 25] as const }];
    const result = remapScale9Commands(cmds, mapper);
    expect(result[0]).toEqual({ key: 'drawCircle', args: [55, 60, 25] });
  });

  it('remaps drawEllipse corners and recomputes size', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    const cmds = [{ key: 'drawEllipse' as const, args: [0, 0, 100, 50] as const }];
    const result = remapScale9Commands(cmds, mapper);
    expect(result[0]).toEqual({ key: 'drawEllipse', args: [0, 0, 200, 100] });
  });

  it('returns an array of the same length as the input', () => {
    const shape = createScale9Shape(grid);
    beginFill(shape.data, 0xff0000);
    drawRect(shape.data, 0, 0, 100, 100);
    const mapper = buildScale9Mapper(shape.data.commands, grid, 2, 2)!;
    const result = remapScale9Commands(shape.data.commands, mapper);
    expect(result).toHaveLength(shape.data.commands.length);
  });
});
