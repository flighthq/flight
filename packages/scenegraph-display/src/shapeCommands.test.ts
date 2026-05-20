import { createShapeData } from './shape';
import {
  beginBitmapFill,
  beginFill,
  beginGradientFill,
  cubicCurveTo,
  curveTo,
  drawCircle,
  drawEllipse,
  drawPath,
  drawRect,
  drawRoundRect,
  drawRoundRectComplex,
  endFill,
  GraphicsPathCommand,
  lineBitmapStyle,
  lineGradientStyle,
  lineStyle,
  lineTo,
  moveTo,
} from './shapeCommands';

const fakeImageSource = { id: 1, height: 10, src: null, width: 10 } as never;
const fakeMatrix = { id: 2, a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } as never;

describe('beginBitmapFill', () => {
  it('pushes a beginBitmapFill command with bitmap, matrix, repeat, smooth', () => {
    const data = createShapeData();
    beginBitmapFill(data, fakeImageSource, fakeMatrix, false, true);
    expect(data.commands[0]).toEqual({ key: 'beginBitmapFill', args: [fakeImageSource, fakeMatrix, false, true] });
  });

  it('defaults matrix to null, repeat to true, smooth to false', () => {
    const data = createShapeData();
    beginBitmapFill(data, fakeImageSource);
    expect(data.commands[0]).toMatchObject({ key: 'beginBitmapFill', args: [fakeImageSource, null, true, false] });
  });
});

describe('beginFill', () => {
  it('pushes a beginFill command with color and alpha', () => {
    const data = createShapeData();
    beginFill(data, 0xff0000, 0.5);
    expect(data.commands[0]).toEqual({ key: 'beginFill', args: [0xff0000, 0.5] });
  });

  it('defaults to color 0 and alpha 1', () => {
    const data = createShapeData();
    beginFill(data);
    expect(data.commands[0]).toEqual({ key: 'beginFill', args: [0, 1] });
  });
});

describe('beginGradientFill', () => {
  it('pushes a beginGradientFill command with all fields', () => {
    const data = createShapeData();
    beginGradientFill(data, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255], fakeMatrix, 'reflect', 'linearRGB', 0.5);
    expect(data.commands[0]).toEqual({
      key: 'beginGradientFill',
      args: ['linear', [0xff0000, 0x0000ff], [1, 1], [0, 255], fakeMatrix, 'reflect', 'linearRGB', 0.5],
    });
  });

  it('defaults matrix null, spreadMethod pad, interpolationMethod rgb, focalPointRatio 0', () => {
    const data = createShapeData();
    beginGradientFill(data, 'radial', [0xffffff], [1], [0]);
    expect(data.commands[0]).toMatchObject({
      key: 'beginGradientFill',
      args: ['radial', [0xffffff], [1], [0], null, 'pad', 'rgb', 0],
    });
  });
});

describe('cubicCurveTo', () => {
  it('pushes a cubicCurveTo command with all control and anchor points', () => {
    const data = createShapeData();
    cubicCurveTo(data, 10, 20, 30, 40, 50, 60);
    expect(data.commands[0]).toEqual({ key: 'cubicCurveTo', args: [10, 20, 30, 40, 50, 60] });
  });
});

describe('curveTo', () => {
  it('pushes a curveTo command with control and anchor points', () => {
    const data = createShapeData();
    curveTo(data, 10, 20, 30, 40);
    expect(data.commands[0]).toEqual({ key: 'curveTo', args: [10, 20, 30, 40] });
  });
});

describe('drawCircle', () => {
  it('pushes a drawCircle command with position and radius', () => {
    const data = createShapeData();
    drawCircle(data, 50, 50, 25);
    expect(data.commands[0]).toEqual({ key: 'drawCircle', args: [50, 50, 25] });
  });
});

describe('drawEllipse', () => {
  it('pushes a drawEllipse command with position and dimensions', () => {
    const data = createShapeData();
    drawEllipse(data, 10, 20, 100, 50);
    expect(data.commands[0]).toEqual({ key: 'drawEllipse', args: [10, 20, 100, 50] });
  });
});

describe('drawPath', () => {
  it('pushes a drawPath command with commands, data, and winding', () => {
    const sd = createShapeData();
    const cmds = [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO];
    drawPath(sd, cmds, [0, 0, 100, 100], 'nonZero');
    expect(sd.commands[0]).toEqual({ key: 'drawPath', args: [cmds, [0, 0, 100, 100], 'nonZero'] });
  });

  it('defaults winding to evenOdd', () => {
    const data = createShapeData();
    drawPath(data, [], []);
    expect(data.commands[0]).toMatchObject({ key: 'drawPath', args: [[], [], 'evenOdd'] });
  });
});

describe('drawRect', () => {
  it('pushes a drawRect command with position and dimensions', () => {
    const data = createShapeData();
    drawRect(data, 10, 20, 100, 50);
    expect(data.commands[0]).toEqual({ key: 'drawRect', args: [10, 20, 100, 50] });
  });
});

describe('drawRoundRect', () => {
  it('pushes a drawRoundRect command with position, dimensions, and corner radii', () => {
    const data = createShapeData();
    drawRoundRect(data, 0, 0, 100, 50, 10, 8);
    expect(data.commands[0]).toEqual({ key: 'drawRoundRect', args: [0, 0, 100, 50, 10, 8] });
  });
});

describe('drawRoundRectComplex', () => {
  it('expands to moveTo/lineTo/curveTo commands (no new command type)', () => {
    const data = createShapeData();
    drawRoundRectComplex(data, 0, 0, 100, 50, 5, 5, 5, 5);
    expect(data.commands.length).toBeGreaterThan(1);
    expect(data.commands[0]).toMatchObject({ key: 'moveTo' });
    const knownPrimitives = ['moveTo', 'lineTo', 'curveTo'];
    expect(data.commands.every((c) => knownPrimitives.includes(c.key))).toBe(true);
  });
});

describe('endFill', () => {
  it('pushes an endFill command', () => {
    const data = createShapeData();
    endFill(data);
    expect(data.commands[0]).toEqual({ key: 'endFill', args: [] });
  });
});

describe('GraphicsPathCommand', () => {
  it('has expected numeric values', () => {
    expect(GraphicsPathCommand.NO_OP).toBe(0);
    expect(GraphicsPathCommand.MOVE_TO).toBe(1);
    expect(GraphicsPathCommand.LINE_TO).toBe(2);
    expect(GraphicsPathCommand.CURVE_TO).toBe(3);
    expect(GraphicsPathCommand.WIDE_MOVE_TO).toBe(4);
    expect(GraphicsPathCommand.WIDE_LINE_TO).toBe(5);
    expect(GraphicsPathCommand.CUBIC_CURVE_TO).toBe(6);
  });
});

describe('lineBitmapStyle', () => {
  it('pushes a lineBitmapStyle command with bitmap, matrix, repeat, smooth', () => {
    const data = createShapeData();
    lineBitmapStyle(data, fakeImageSource, fakeMatrix, false, true);
    expect(data.commands[0]).toEqual({ key: 'lineBitmapStyle', args: [fakeImageSource, fakeMatrix, false, true] });
  });

  it('defaults matrix to null, repeat to true, smooth to false', () => {
    const data = createShapeData();
    lineBitmapStyle(data, fakeImageSource);
    expect(data.commands[0]).toMatchObject({ key: 'lineBitmapStyle', args: [fakeImageSource, null, true, false] });
  });
});

describe('lineGradientStyle', () => {
  it('pushes a lineGradientStyle command with all fields', () => {
    const data = createShapeData();
    lineGradientStyle(data, 'linear', [0xff0000], [1], [0]);
    expect(data.commands[0]).toMatchObject({
      key: 'lineGradientStyle',
      args: ['linear', [0xff0000], [1], [0], null, 'pad', 'rgb', 0],
    });
  });
});

describe('lineStyle', () => {
  it('pushes a lineStyle command with all parameters', () => {
    const data = createShapeData();
    lineStyle(data, 2, 0x0000ff, 0.8, true, 'horizontal', 'round', 'bevel', 5);
    expect(data.commands[0]).toEqual({
      key: 'lineStyle',
      args: [2, 0x0000ff, 0.8, true, 'horizontal', 'round', 'bevel', 5],
    });
  });

  it('defaults thickness 1, color 0, alpha 1, pixelHinting false, scaleMode normal, caps none, joints round, miterLimit 3', () => {
    const data = createShapeData();
    lineStyle(data);
    expect(data.commands[0]).toEqual({
      key: 'lineStyle',
      args: [1, 0, 1, false, 'normal', 'none', 'round', 3],
    });
  });
});

describe('lineTo', () => {
  it('pushes a lineTo command with position', () => {
    const data = createShapeData();
    lineTo(data, 100, 200);
    expect(data.commands[0]).toEqual({ key: 'lineTo', args: [100, 200] });
  });
});

describe('moveTo', () => {
  it('pushes a moveTo command with position', () => {
    const data = createShapeData();
    moveTo(data, 10, 20);
    expect(data.commands[0]).toEqual({ key: 'moveTo', args: [10, 20] });
  });
});
