import { createGraphics } from './graphics';
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
  // drawTriangles,
  endFill,
  GraphicsPathCommand,
  lineBitmapStyle,
  lineGradientStyle,
  lineStyle,
  lineTo,
  moveTo,
} from './graphicsCommands';

const fakeImageSource = { id: 1, height: 10, src: null, width: 10 } as never;
const fakeMatrix = { id: 2, a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } as never;

describe('beginBitmapFill', () => {
  it('pushes a beginBitmapFill command with bitmap, matrix, repeat, smooth', () => {
    const g = createGraphics();
    beginBitmapFill(g, fakeImageSource, fakeMatrix, false, true);
    expect(g.commands[0]).toEqual({
      type: 'beginBitmapFill',
      bitmap: fakeImageSource,
      matrix: fakeMatrix,
      repeat: false,
      smooth: true,
    });
  });

  it('defaults matrix to null, repeat to true, smooth to false', () => {
    const g = createGraphics();
    beginBitmapFill(g, fakeImageSource);
    expect(g.commands[0]).toMatchObject({ type: 'beginBitmapFill', matrix: null, repeat: true, smooth: false });
  });
});

describe('beginFill', () => {
  it('pushes a beginFill command with color and alpha', () => {
    const g = createGraphics();
    beginFill(g, 0xff0000, 0.5);
    expect(g.commands[0]).toEqual({ type: 'beginFill', color: 0xff0000, alpha: 0.5 });
  });

  it('defaults to color 0 and alpha 1', () => {
    const g = createGraphics();
    beginFill(g);
    expect(g.commands[0]).toEqual({ type: 'beginFill', color: 0, alpha: 1 });
  });
});

describe('beginGradientFill', () => {
  it('pushes a beginGradientFill command with all fields', () => {
    const g = createGraphics();
    beginGradientFill(g, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255], fakeMatrix, 'reflect', 'linearRGB', 0.5);
    expect(g.commands[0]).toEqual({
      type: 'beginGradientFill',
      gradientType: 'linear',
      colors: [0xff0000, 0x0000ff],
      alphas: [1, 1],
      ratios: [0, 255],
      matrix: fakeMatrix,
      spreadMethod: 'reflect',
      interpolationMethod: 'linearRGB',
      focalPointRatio: 0.5,
    });
  });

  it('defaults matrix null, spreadMethod pad, interpolationMethod rgb, focalPointRatio 0', () => {
    const g = createGraphics();
    beginGradientFill(g, 'radial', [0xffffff], [1], [0]);
    expect(g.commands[0]).toMatchObject({
      type: 'beginGradientFill',
      matrix: null,
      spreadMethod: 'pad',
      interpolationMethod: 'rgb',
      focalPointRatio: 0,
    });
  });
});

describe('cubicCurveTo', () => {
  it('pushes a cubicCurveTo command with all control and anchor points', () => {
    const g = createGraphics();
    cubicCurveTo(g, 10, 20, 30, 40, 50, 60);
    expect(g.commands[0]).toEqual({
      type: 'cubicCurveTo',
      controlX1: 10,
      controlY1: 20,
      controlX2: 30,
      controlY2: 40,
      anchorX: 50,
      anchorY: 60,
    });
  });
});

describe('curveTo', () => {
  it('pushes a curveTo command with control and anchor points', () => {
    const g = createGraphics();
    curveTo(g, 10, 20, 30, 40);
    expect(g.commands[0]).toEqual({ type: 'curveTo', controlX: 10, controlY: 20, anchorX: 30, anchorY: 40 });
  });
});

describe('drawCircle', () => {
  it('pushes a drawCircle command with position and radius', () => {
    const g = createGraphics();
    drawCircle(g, 50, 50, 25);
    expect(g.commands[0]).toEqual({ type: 'drawCircle', x: 50, y: 50, radius: 25 });
  });
});

describe('drawEllipse', () => {
  it('pushes a drawEllipse command with position and dimensions', () => {
    const g = createGraphics();
    drawEllipse(g, 10, 20, 100, 50);
    expect(g.commands[0]).toEqual({ type: 'drawEllipse', x: 10, y: 20, width: 100, height: 50 });
  });
});

describe('drawPath', () => {
  it('pushes a drawPath command with commands, data, and winding', () => {
    const g = createGraphics();
    const cmds = [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO];
    drawPath(g, cmds, [0, 0, 100, 100], 'nonZero');
    expect(g.commands[0]).toEqual({ type: 'drawPath', commands: cmds, data: [0, 0, 100, 100], winding: 'nonZero' });
  });

  it('defaults winding to evenOdd', () => {
    const g = createGraphics();
    drawPath(g, [], []);
    expect(g.commands[0]).toMatchObject({ type: 'drawPath', winding: 'evenOdd' });
  });
});

describe('drawRect', () => {
  it('pushes a drawRect command with position and dimensions', () => {
    const g = createGraphics();
    drawRect(g, 10, 20, 100, 50);
    expect(g.commands[0]).toEqual({ type: 'drawRect', x: 10, y: 20, width: 100, height: 50 });
  });
});

describe('drawRoundRect', () => {
  it('pushes a drawRoundRect command with position, dimensions, and corner radii', () => {
    const g = createGraphics();
    drawRoundRect(g, 0, 0, 100, 50, 10, 8);
    expect(g.commands[0]).toEqual({
      type: 'drawRoundRect',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      ellipseWidth: 10,
      ellipseHeight: 8,
    });
  });
});

describe('drawRoundRectComplex', () => {
  it('expands to moveTo/lineTo/curveTo commands (no new command type)', () => {
    const g = createGraphics();
    drawRoundRectComplex(g, 0, 0, 100, 50, 5, 5, 5, 5);
    expect(g.commands.length).toBeGreaterThan(1);
    expect(g.commands[0]).toMatchObject({ type: 'moveTo' });
    expect(g.commands.every((c) => c.type !== 'drawRoundRectComplex')).toBe(true);
  });
});

// describe('drawTriangles', () => {
//   it('pushes a drawTriangles command with vertices, indices, uvtData, and culling', () => {
//     const g = createGraphics();
//     drawTriangles(g, [0, 0, 100, 0, 50, 100], [0, 1, 2], [0, 0, 1, 0, 0.5, 1], 'positive');
//     expect(g.commands[0]).toEqual({
//       type: 'drawTriangles',
//       vertices: [0, 0, 100, 0, 50, 100],
//       indices: [0, 1, 2],
//       uvtData: [0, 0, 1, 0, 0.5, 1],
//       culling: 'positive',
//     });
//   });
//
//   it('defaults indices to null, uvtData to null, culling to none', () => {
//     const g = createGraphics();
//     drawTriangles(g, [0, 0, 100, 0, 50, 100]);
//     expect(g.commands[0]).toMatchObject({ type: 'drawTriangles', indices: null, uvtData: null, culling: 'none' });
//   });
// });

describe('endFill', () => {
  it('pushes an endFill command', () => {
    const g = createGraphics();
    endFill(g);
    expect(g.commands[0]).toEqual({ type: 'endFill' });
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
    const g = createGraphics();
    lineBitmapStyle(g, fakeImageSource, fakeMatrix, false, true);
    expect(g.commands[0]).toEqual({
      type: 'lineBitmapStyle',
      bitmap: fakeImageSource,
      matrix: fakeMatrix,
      repeat: false,
      smooth: true,
    });
  });

  it('defaults matrix to null, repeat to true, smooth to false', () => {
    const g = createGraphics();
    lineBitmapStyle(g, fakeImageSource);
    expect(g.commands[0]).toMatchObject({ type: 'lineBitmapStyle', matrix: null, repeat: true, smooth: false });
  });
});

describe('lineGradientStyle', () => {
  it('pushes a lineGradientStyle command with all fields', () => {
    const g = createGraphics();
    lineGradientStyle(g, 'linear', [0xff0000], [1], [0]);
    expect(g.commands[0]).toMatchObject({
      type: 'lineGradientStyle',
      gradientType: 'linear',
      colors: [0xff0000],
      alphas: [1],
      ratios: [0],
      matrix: null,
      spreadMethod: 'pad',
      interpolationMethod: 'rgb',
      focalPointRatio: 0,
    });
  });
});

describe('lineStyle', () => {
  it('pushes a lineStyle command with all parameters', () => {
    const g = createGraphics();
    lineStyle(g, 2, 0x0000ff, 0.8, true, 'horizontal', 'round', 'bevel', 5);
    expect(g.commands[0]).toEqual({
      type: 'lineStyle',
      thickness: 2,
      color: 0x0000ff,
      alpha: 0.8,
      pixelHinting: true,
      scaleMode: 'horizontal',
      caps: 'round',
      joints: 'bevel',
      miterLimit: 5,
    });
  });

  it('defaults thickness 1, color 0, alpha 1, pixelHinting false, scaleMode normal, caps none, joints round, miterLimit 3', () => {
    const g = createGraphics();
    lineStyle(g);
    expect(g.commands[0]).toEqual({
      type: 'lineStyle',
      thickness: 1,
      color: 0,
      alpha: 1,
      pixelHinting: false,
      scaleMode: 'normal',
      caps: 'none',
      joints: 'round',
      miterLimit: 3,
    });
  });
});

describe('lineTo', () => {
  it('pushes a lineTo command with position', () => {
    const g = createGraphics();
    lineTo(g, 100, 200);
    expect(g.commands[0]).toEqual({ type: 'lineTo', x: 100, y: 200 });
  });
});

describe('moveTo', () => {
  it('pushes a moveTo command with position', () => {
    const g = createGraphics();
    moveTo(g, 10, 20);
    expect(g.commands[0]).toEqual({ type: 'moveTo', x: 10, y: 20 });
  });
});
