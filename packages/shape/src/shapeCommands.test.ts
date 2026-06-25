import { createShape } from './shape';
import {
  appendShapeArc,
  appendShapeArcTo,
  appendShapeBeginBitmapFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeDrawTriangles,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineBitmapStyle,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapePolygon,
  appendShapePolyline,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  appendShapeRoundRectangleVarying,
  PathCommand,
} from './shapeCommands';

const fakeImageSource = { id: 1, height: 10, source: null, width: 10 } as never;
const fakeMatrix = { id: 2, a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } as never;

describe('appendShapeArc', () => {
  it('emits a moveTo followed by at least one cubicCurveTo', () => {
    const shape = createShape();
    appendShapeArc(shape, 50, 50, 25, 0, Math.PI);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    expect(keys[0]).toBe('moveTo');
    expect(keys.slice(1).every((k) => k === 'cubicCurveTo')).toBe(true);
    expect(keys.length).toBeGreaterThan(1);
  });

  it('arc start point is on the circle at startAngle', () => {
    const shape = createShape();
    appendShapeArc(shape, 0, 0, 10, 0, Math.PI / 2);
    // moveTo args are at indices [2] and [3]
    expect(shape.data.commands[2]).toBeCloseTo(10, 5);
    expect(shape.data.commands[3]).toBeCloseTo(0, 5);
  });

  it('a full circle uses 4 cubic segments', () => {
    const shape = createShape();
    appendShapeArc(shape, 0, 0, 10, 0, Math.PI * 2);
    let count = 0;
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      if (key === 'cubicCurveTo') count++;
      i += argCount + 2;
    }
    expect(count).toBe(4);
  });

  it('anticlockwise arc sweeps in the negative direction', () => {
    const shape = createShape();
    appendShapeArc(shape, 0, 0, 10, 0, Math.PI / 2, true);
    // 3/4-circle anticlockwise; should use 3 cubicCurveTo segments.
    let count = 0;
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      if (key === 'cubicCurveTo') count++;
      i += argCount + 2;
    }
    expect(count).toBe(3);
  });
});

describe('appendShapeArcTo', () => {
  it('emits a lineTo followed by cubicCurveTo commands for a right-angle corner', () => {
    const shape = createShape();
    // Start at (100, 0), corner at (100, 100), end direction toward (0, 100) with radius 20.
    appendShapeMoveTo(shape, 100, 0);
    appendShapeArcTo(shape, 100, 100, 0, 100, 20);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    // moveTo, lineTo (to tangent start), then cubicCurveTo arc segments.
    expect(keys[0]).toBe('moveTo');
    expect(keys[1]).toBe('lineTo');
    expect(keys.slice(2).every((k) => k === 'cubicCurveTo')).toBe(true);
  });

  it('falls back to a lineTo when the tangent has zero length', () => {
    const shape = createShape();
    // pen at (100, 100), corner at (100, 100) — zero-length tangent.
    appendShapeMoveTo(shape, 100, 100);
    appendShapeArcTo(shape, 100, 100, 200, 100, 10);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    // Degenerate: should only have the original moveTo and one lineTo.
    expect(keys).toContain('lineTo');
    expect(keys.every((k) => k === 'moveTo' || k === 'lineTo')).toBe(true);
  });
});

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

describe('appendShapeDrawTriangles', () => {
  it('pushes a drawTriangles command with vertices, null indices, null uvtData, and culling none', () => {
    const shape = createShape();
    const verts = [0, 0, 100, 0, 50, 80];
    appendShapeDrawTriangles(shape, verts);
    expect(shape.data.commands).toEqual(['drawTriangles', 4, verts, null, null, 'none']);
  });

  it('pushes a drawTriangles command with indices and uvtData', () => {
    const shape = createShape();
    const verts = [0, 0, 100, 0, 50, 80];
    const indices = [0, 1, 2];
    const uvt = [0, 0, 1, 0, 0.5, 1];
    appendShapeDrawTriangles(shape, verts, indices, uvt, 'positive');
    expect(shape.data.commands).toEqual(['drawTriangles', 4, verts, indices, uvt, 'positive']);
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
    const cmds = [PathCommand.MOVE_TO, PathCommand.LINE_TO];
    appendShapePath(shape, cmds, [0, 0, 100, 100], 'nonZero');
    expect(shape.data.commands).toEqual(['drawPath', 3, cmds, [0, 0, 100, 100], 'nonZero']);
  });

  it('defaults winding to evenOdd', () => {
    const shape = createShape();
    appendShapePath(shape, [], []);
    expect(shape.data.commands).toEqual(['drawPath', 3, [], [], 'evenOdd']);
  });
});

describe('appendShapePolygon', () => {
  it('emits moveTo + lineTo commands and closes back to first vertex', () => {
    const shape = createShape();
    appendShapePolygon(shape, [0, 0, 100, 0, 50, 80]);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    // moveTo + 2 lineTo + 1 closing lineTo = 4 entries.
    expect(keys).toEqual(['moveTo', 'lineTo', 'lineTo', 'lineTo']);
    // The last lineTo should return to (0, 0).
    const lastIdx = shape.data.commands.length - 4; // lineTo has argCount=2, so 4 elements from end
    expect(shape.data.commands[lastIdx + 2]).toBe(0);
    expect(shape.data.commands[lastIdx + 3]).toBe(0);
  });

  it('emits nothing for fewer than 2 points', () => {
    const shape = createShape();
    appendShapePolygon(shape, [0, 0]);
    expect(shape.data.commands).toHaveLength(0);
  });
});

describe('appendShapePolyline', () => {
  it('emits moveTo + lineTo commands without closing', () => {
    const shape = createShape();
    appendShapePolyline(shape, [0, 0, 50, 50, 100, 0]);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    // moveTo + 2 lineTo; no closing lineTo.
    expect(keys).toEqual(['moveTo', 'lineTo', 'lineTo']);
  });

  it('emits nothing for fewer than 2 points', () => {
    const shape = createShape();
    appendShapePolyline(shape, [0, 0]);
    expect(shape.data.commands).toHaveLength(0);
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

describe('appendShapeRoundRectangleVarying', () => {
  it('expands to moveTo/lineTo/curveTo commands (no new command type)', () => {
    const shape = createShape();
    appendShapeRoundRectangleVarying(shape, 0, 0, 100, 50, 5, 5, 5, 5);
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

describe('PathCommand', () => {
  it('has expected numeric values', () => {
    expect(PathCommand.NO_OP).toBe(0);
    expect(PathCommand.MOVE_TO).toBe(1);
    expect(PathCommand.LINE_TO).toBe(2);
    expect(PathCommand.CURVE_TO).toBe(3);
    expect(PathCommand.WIDE_MOVE_TO).toBe(4);
    expect(PathCommand.WIDE_LINE_TO).toBe(5);
    expect(PathCommand.CUBIC_CURVE_TO).toBe(6);
  });
});
