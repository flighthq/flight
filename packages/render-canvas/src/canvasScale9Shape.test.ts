import { beginFill, createScale9Shape, drawRect } from '@flighthq/scenegraph-display';

import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { Scale9ShapeKind } from '@flighthq/types';

import { buildScale9Mapper } from './canvasScale9Mapper';
import { createCanvasRenderState } from './canvasRenderState';
import { defaultCanvasScale9ShapeRenderer, drawCanvasScale9Shape, remapScale9Commands } from './canvasScale9Shape';
import { defaultCanvasShapeCommands } from './canvasShapeCommands';
import { registerCanvasShapeCommands } from './canvasShapeRegistry';

beforeAll(() => {
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
});

const grid = { x: 10, y: 10, width: 80, height: 80 };

describe('remapScale9Commands', () => {
  it('passes style commands through unchanged', () => {
    const mapper = { mapX: (x: number) => x, mapY: (y: number) => y };
    const cmds: unknown[] = ['beginFill', 2, 0xff0000, 1];
    const result = remapScale9Commands(cmds, mapper);
    expect(result).toEqual(['beginFill', 2, 0xff0000, 1]);
  });

  it('remaps moveTo coordinates', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 3 };
    const cmds: unknown[] = ['moveTo', 2, 10, 20];
    const result = remapScale9Commands(cmds, mapper);
    expect(result).toEqual(['moveTo', 2, 20, 60]);
  });

  it('remaps lineTo coordinates', () => {
    const mapper = { mapX: (x: number) => x + 5, mapY: (y: number) => y + 10 };
    const cmds: unknown[] = ['lineTo', 2, 100, 50];
    const result = remapScale9Commands(cmds, mapper);
    expect(result).toEqual(['lineTo', 2, 105, 60]);
  });

  it('remaps drawRect corners and recomputes size', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    const cmds: unknown[] = ['drawRect', 4, 10, 20, 50, 30];
    const result = remapScale9Commands(cmds, mapper);
    // x=10→20, y=20→40, x+w=60→120 (w=100), y+h=50→100 (h=60)
    expect(result).toEqual(['drawRect', 4, 20, 40, 100, 60]);
  });

  it('remaps drawRoundRect corners but leaves ellipse radii unchanged', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    const cmds: unknown[] = ['drawRoundRect', 6, 10, 20, 50, 30, 8, 8];
    const result = remapScale9Commands(cmds, mapper);
    expect(result).toEqual(['drawRoundRect', 6, 20, 40, 100, 60, 8, 8]);
  });

  it('remaps drawCircle center but leaves radius unchanged', () => {
    const mapper = { mapX: (x: number) => x + 5, mapY: (y: number) => y + 10 };
    const cmds: unknown[] = ['drawCircle', 3, 50, 50, 25];
    const result = remapScale9Commands(cmds, mapper);
    expect(result).toEqual(['drawCircle', 3, 55, 60, 25]);
  });

  it('remaps drawEllipse corners and recomputes size', () => {
    const mapper = { mapX: (x: number) => x * 2, mapY: (y: number) => y * 2 };
    const cmds: unknown[] = ['drawEllipse', 4, 0, 0, 100, 50];
    const result = remapScale9Commands(cmds, mapper);
    expect(result).toEqual(['drawEllipse', 4, 0, 0, 200, 100]);
  });

  it('returns a buffer with the same element count as the input', () => {
    const shape = createScale9Shape(grid);
    beginFill(shape, 0xff0000);
    drawRect(shape, 0, 0, 100, 100);
    const mapper = buildScale9Mapper(shape.data.commands, grid, 2, 2)!;
    const result = remapScale9Commands(shape.data.commands, mapper);
    expect(result).toHaveLength(shape.data.commands.length);
  });
});

describe('drawCanvasScale9Shape', () => {
  it('does not throw when commands list is empty', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const state = createCanvasRenderState(canvas);
    registerRenderer(state, Scale9ShapeKind, defaultCanvasScale9ShapeRenderer);
    const shape = createScale9Shape(grid);
    const data = getDisplayObjectRenderNode(state, shape);
    expect(() => drawCanvasScale9Shape(state, data)).not.toThrow();
  });
});
