import { createShape } from './shape';
import {
  appendShapeBeginBitmapFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineBitmapStyle,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  appendShapeRoundRectanglePath,
  GraphicsPathCommand,
} from './shapeCommands';

const fakeImageSource = { id: 1, height: 10, source: null, width: 10 } as never;
const fakeMatrix = { id: 2, a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } as never;

describe('appendShapeBeginBitmapFill', () => {
  it('pushes a beginBitmapFill command with bitmap, matrix, repeat, smooth', () => {
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, fakeImageSource, fakeMatrix, false, true);
    expect(shape.data.commands).toEqual(['beginBitmapFill', 4, fakeImageSource, fakeMatrix, false, true]);
  });

  it('defaults matrix to null, repeat to true, smooth to false', () => {
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, fakeImageSource);
    expect(shape.data.commands).toEqual(['beginBitmapFill', 4, fakeImageSource, null, true, false]);
  });
});

describe('appendShapeBeginFill', () => {
  it('pushes a beginFill command with color and alpha', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 0.5);
    expect(shape.data.commands).toEqual(['beginFill', 2, 0xff0000, 0.5]);
  });

  it('defaults to color 0 and alpha 1', () => {
    const shape = createShape();
    appendShapeBeginFill(shape);
    expect(shape.data.commands).toEqual(['beginFill', 2, 0, 1]);
  });
});

describe('appendShapeBeginGradientFill', () => {
  it('pushes a beginGradientFill command with all fields', () => {
    const shape = createShape();
    appendShapeBeginGradientFill(
      shape,
      'linear',
      [0xff0000, 0x0000ff],
      [1, 1],
      [0, 255],
      fakeMatrix,
      'reflect',
      'linearRGB',
      0.5,
    );
    expect(shape.data.commands).toEqual([
      'beginGradientFill',
      8,
      'linear',
      [0xff0000, 0x0000ff],
      [1, 1],
      [0, 255],
      fakeMatrix,
      'reflect',
      'linearRGB',
      0.5,
    ]);
  });

  it('defaults matrix null, spreadMethod pad, interpolationMethod rgb, focalPointRatio 0', () => {
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'radial', [0xffffff], [1], [0]);
    expect(shape.data.commands).toEqual([
      'beginGradientFill',
      8,
      'radial',
      [0xffffff],
      [1],
      [0],
      null,
      'pad',
      'rgb',
      0,
    ]);
  });
});

describe('appendShapeCircle', () => {
  it('pushes a drawCircle command with position and radius', () => {
    const shape = createShape();
    appendShapeCircle(shape, 50, 50, 25);
    expect(shape.data.commands).toEqual(['drawCircle', 3, 50, 50, 25]);
  });
});

describe('appendShapeCubicCurveTo', () => {
  it('pushes a cubicCurveTo command with all control and anchor points', () => {
    const shape = createShape();
    appendShapeCubicCurveTo(shape, 10, 20, 30, 40, 50, 60);
    expect(shape.data.commands).toEqual(['cubicCurveTo', 6, 10, 20, 30, 40, 50, 60]);
  });
});

describe('appendShapeCurveTo', () => {
  it('pushes a curveTo command with control and anchor points', () => {
    const shape = createShape();
    appendShapeCurveTo(shape, 10, 20, 30, 40);
    expect(shape.data.commands).toEqual(['curveTo', 4, 10, 20, 30, 40]);
  });
});

describe('appendShapeEllipse', () => {
  it('pushes a drawEllipse command with position and dimensions', () => {
    const shape = createShape();
    appendShapeEllipse(shape, 10, 20, 100, 50);
    expect(shape.data.commands).toEqual(['drawEllipse', 4, 10, 20, 100, 50]);
  });
});

describe('appendShapeEndFill', () => {
  it('pushes an endFill command', () => {
    const shape = createShape();
    appendShapeEndFill(shape);
    expect(shape.data.commands).toEqual(['endFill', 0]);
  });
});

describe('appendShapeLineBitmapStyle', () => {
  it('pushes a lineBitmapStyle command with bitmap, matrix, repeat, smooth', () => {
    const shape = createShape();
    appendShapeLineBitmapStyle(shape, fakeImageSource, fakeMatrix, false, true);
    expect(shape.data.commands).toEqual(['lineBitmapStyle', 4, fakeImageSource, fakeMatrix, false, true]);
  });

  it('defaults matrix to null, repeat to true, smooth to false', () => {
    const shape = createShape();
    appendShapeLineBitmapStyle(shape, fakeImageSource);
    expect(shape.data.commands).toEqual(['lineBitmapStyle', 4, fakeImageSource, null, true, false]);
  });
});

describe('appendShapeLineGradientStyle', () => {
  it('pushes a lineGradientStyle command with all fields', () => {
    const shape = createShape();
    appendShapeLineGradientStyle(shape, 'linear', [0xff0000], [1], [0]);
    expect(shape.data.commands).toEqual([
      'lineGradientStyle',
      8,
      'linear',
      [0xff0000],
      [1],
      [0],
      null,
      'pad',
      'rgb',
      0,
    ]);
  });
});

describe('appendShapeLineStyle', () => {
  it('pushes a lineStyle command with all parameters', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x0000ff, 0.8, true, 'horizontal', 'round', 'bevel', 5);
    expect(shape.data.commands).toEqual(['lineStyle', 8, 2, 0x0000ff, 0.8, true, 'horizontal', 'round', 'bevel', 5]);
  });

  it('defaults thickness 1, color 0, alpha 1, pixelHinting false, scaleMode normal, caps none, joints round, miterLimit 3', () => {
    const shape = createShape();
    appendShapeLineStyle(shape);
    expect(shape.data.commands).toEqual(['lineStyle', 8, 1, 0, 1, false, 'normal', 'none', 'round', 3]);
  });
});

describe('appendShapeLineTo', () => {
  it('pushes a lineTo command with position', () => {
    const shape = createShape();
    appendShapeLineTo(shape, 100, 200);
    expect(shape.data.commands).toEqual(['lineTo', 2, 100, 200]);
  });
});

describe('appendShapeMoveTo', () => {
  it('pushes a moveTo command with position', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 10, 20);
    expect(shape.data.commands).toEqual(['moveTo', 2, 10, 20]);
  });
});

describe('appendShapePath', () => {
  it('pushes a drawPath command with commands, data, and winding', () => {
    const shape = createShape();
    const cmds = [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO];
    appendShapePath(shape, cmds, [0, 0, 100, 100], 'nonZero');
    expect(shape.data.commands).toEqual(['drawPath', 3, cmds, [0, 0, 100, 100], 'nonZero']);
  });

  it('defaults winding to evenOdd', () => {
    const shape = createShape();
    appendShapePath(shape, [], []);
    expect(shape.data.commands).toEqual(['drawPath', 3, [], [], 'evenOdd']);
  });
});

describe('appendShapeRectangle', () => {
  it('pushes a drawRectangle command with position and dimensions', () => {
    const shape = createShape();
    appendShapeRectangle(shape, 10, 20, 100, 50);
    expect(shape.data.commands).toEqual(['drawRectangle', 4, 10, 20, 100, 50]);
  });
});

describe('appendShapeRoundRectangle', () => {
  it('pushes a drawRoundRectangle command with position, dimensions, and corner radii', () => {
    const shape = createShape();
    appendShapeRoundRectangle(shape, 0, 0, 100, 50, 10, 8);
    expect(shape.data.commands).toEqual(['drawRoundRectangle', 6, 0, 0, 100, 50, 10, 8]);
  });
});

describe('appendShapeRoundRectanglePath', () => {
  it('expands to moveTo/lineTo/curveTo commands (no new command type)', () => {
    const shape = createShape();
    appendShapeRoundRectanglePath(shape, 0, 0, 100, 50, 5, 5, 5, 5);
    const knownPrimitives = ['moveTo', 'lineTo', 'curveTo'];
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    expect(keys.length).toBeGreaterThan(1);
    expect(keys.every((k) => knownPrimitives.includes(k))).toBe(true);
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
