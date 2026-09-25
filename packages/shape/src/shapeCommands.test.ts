import { getNodeLocalContentRevision } from '@flighthq/node/contract';

import { createShape } from './shape.ts';
import {
  appendShapeArc,
  appendShapeEllipticalArcTo,
  appendShapeTangentArcTo,
  appendShapeBeginTextureFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeQuadraticCurveTo,
  appendShapeDrawTriangles,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineTextureStyle,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapePolygon,
  appendShapePolyline,
  appendShapeRectangle,
  appendShapeRoundedRectangle,
  appendShapeRoundedRectangleWithCornerRadii,
  PathCommand,
} from './shapeCommands.ts';

const fakeTexture = { id: 1 } as never;
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

describe('appendShapeBeginFill', () => {
  it('pushes a beginFill command with color and alpha', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 0.5);
    expect(shape.data.commands).toEqual(['beginFill', 2, 0xff0000ff, 0.5]);
  });

  it('defaults alpha to 1', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0x000000ff);
    expect(shape.data.commands).toEqual(['beginFill', 2, 0x000000ff, 1]);
  });
});

describe('appendShapeBeginGradientFill', () => {
  it('pushes a beginGradientFill command with all fields', () => {
    const shape = createShape();
    appendShapeBeginGradientFill(
      shape,
      'linear',
      [0xff0000ff, 0x0000ffff],
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
      [0xff0000ff, 0x0000ffff],
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
    appendShapeBeginGradientFill(shape, 'radial', [0xffffffff], [1], [0]);
    expect(shape.data.commands).toEqual([
      'beginGradientFill',
      8,
      'radial',
      [0xffffffff],
      [1],
      [0],
      null,
      'pad',
      'rgb',
      0,
    ]);
  });
});

describe('appendShapeBeginTextureFill', () => {
  it('pushes a beginTextureFill command with texture and matrix', () => {
    const shape = createShape();
    appendShapeBeginTextureFill(shape, fakeTexture, fakeMatrix);
    expect(shape.data.commands).toEqual(['beginTextureFill', 2, fakeTexture, fakeMatrix]);
  });

  it('defaults matrix to null', () => {
    const shape = createShape();
    appendShapeBeginTextureFill(shape, fakeTexture);
    expect(shape.data.commands).toEqual(['beginTextureFill', 2, fakeTexture, null]);
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

  it('accepts negative culling', () => {
    const shape = createShape();
    const verts = [0, 0, 100, 0, 50, 80];
    appendShapeDrawTriangles(shape, verts, null, null, 'negative');
    expect(shape.data.commands[5]).toBe('negative');
  });

  it('invalidates content on the shape', () => {
    const shape = createShape();
    const revision = getNodeLocalContentRevision(shape);
    appendShapeDrawTriangles(shape, [0, 0, 100, 0, 50, 80]);
    expect(getNodeLocalContentRevision(shape)).toBe(revision + 1);
  });

  it('works within a beginFill/endFill cycle', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 1);
    appendShapeDrawTriangles(shape, [0, 0, 100, 0, 50, 80], [0, 1, 2]);
    appendShapeEndFill(shape);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    expect(keys).toEqual(['beginFill', 'drawTriangles', 'endFill']);
  });

  it('stores the vertices array by reference', () => {
    const shape = createShape();
    const verts = [10, 20, 30, 40, 50, 60];
    appendShapeDrawTriangles(shape, verts);
    expect(shape.data.commands[2]).toBe(verts);
  });
});

describe('appendShapeEllipse', () => {
  it('pushes a drawEllipse command with center and radii', () => {
    const shape = createShape();
    appendShapeEllipse(shape, 10, 20, 100, 50);
    expect(shape.data.commands).toEqual(['drawEllipse', 4, 10, 20, 100, 50]);
  });
});

describe('appendShapeEllipticalArcTo', () => {
  it('emits cubicCurveTo commands for a non-degenerate arc', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 100, 0);
    appendShapeEllipticalArcTo(shape, 50, 50, 0, true, false, 100, 1);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    expect(keys).toContain('cubicCurveTo');
  });

  it('emits a lineTo when radiusX is 0', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeEllipticalArcTo(shape, 0, 10, 0, false, false, 50, 50);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    expect(keys[keys.length - 1]).toBe('lineTo');
  });

  it('does nothing when start equals end', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 10, 10);
    const beforeLen = shape.data.commands.length;
    appendShapeEllipticalArcTo(shape, 50, 50, 0, false, false, 10, 10);
    expect(shape.data.commands.length).toBe(beforeLen);
  });
});

describe('appendShapeEndFill', () => {
  it('pushes an endFill command', () => {
    const shape = createShape();
    appendShapeEndFill(shape);
    expect(shape.data.commands).toEqual(['endFill', 0]);
  });
});

describe('appendShapeLineGradientStyle', () => {
  it('pushes a lineGradientStyle command with all fields', () => {
    const shape = createShape();
    appendShapeLineGradientStyle(shape, 'linear', [0xff0000ff], [1], [0]);
    expect(shape.data.commands).toEqual([
      'lineGradientStyle',
      8,
      'linear',
      [0xff0000ff],
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
    appendShapeLineStyle(shape, 2, 0x0000ffff, 0.8, true, 'horizontal', 'round', 'bevel', 5);
    expect(shape.data.commands).toEqual(['lineStyle', 8, 2, 0x0000ffff, 0.8, true, 'horizontal', 'round', 'bevel', 5]);
  });

  it('defaults thickness 1, alpha 1, pixelHinting false, scaleMode normal, caps none, joints round, miterLimit 3', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 1, 0x000000ff);
    expect(shape.data.commands).toEqual(['lineStyle', 8, 1, 0x000000ff, 1, false, 'normal', 'none', 'round', 3]);
  });
});

describe('appendShapeLineTextureStyle', () => {
  it('pushes a lineTextureStyle command with texture and matrix', () => {
    const shape = createShape();
    appendShapeLineTextureStyle(shape, fakeTexture, fakeMatrix);
    expect(shape.data.commands).toEqual(['lineTextureStyle', 2, fakeTexture, fakeMatrix]);
  });

  it('defaults matrix to null', () => {
    const shape = createShape();
    appendShapeLineTextureStyle(shape, fakeTexture);
    expect(shape.data.commands).toEqual(['lineTextureStyle', 2, fakeTexture, null]);
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

  it('bridges a rectangle path from @flighthq/path command constants', () => {
    const shape = createShape();
    const cmds = [
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
    ];
    const data = [0, 0, 100, 0, 100, 50, 0, 50, 0, 0];
    appendShapePath(shape, cmds, data, 'nonZero');
    // The drawPath token stores the commands and data arrays by reference.
    expect(shape.data.commands[2]).toBe(cmds);
    expect(shape.data.commands[3]).toBe(data);
    expect(shape.data.commands[4]).toBe('nonZero');
  });

  it('accepts CUBIC_CURVE_TO commands in the path', () => {
    const shape = createShape();
    const cmds = [PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO];
    const data = [0, 0, 10, 20, 30, 40, 50, 60];
    appendShapePath(shape, cmds, data);
    expect(shape.data.commands).toEqual(['drawPath', 3, cmds, data, 'evenOdd']);
  });

  it('invalidates content on the shape', () => {
    const shape = createShape();
    const revision = getNodeLocalContentRevision(shape);
    appendShapePath(shape, [PathCommand.MOVE_TO], [10, 20]);
    expect(getNodeLocalContentRevision(shape)).toBe(revision + 1);
  });

  it('works within a beginFill/endFill cycle', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0x00ff00ff, 1);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.LINE_TO], [0, 0, 100, 100]);
    appendShapeEndFill(shape);
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      const key = shape.data.commands[i] as string;
      const argCount = shape.data.commands[i + 1] as number;
      keys.push(key);
      i += argCount + 2;
    }
    expect(keys).toEqual(['beginFill', 'drawPath', 'endFill']);
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

describe('appendShapeQuadraticCurveTo', () => {
  it('pushes a quadraticCurveTo command with control and anchor points', () => {
    const shape = createShape();
    appendShapeQuadraticCurveTo(shape, 10, 20, 30, 40);
    expect(shape.data.commands).toEqual(['quadraticCurveTo', 4, 10, 20, 30, 40]);
  });
});

describe('appendShapeRectangle', () => {
  it('pushes a drawRectangle command with position and dimensions', () => {
    const shape = createShape();
    appendShapeRectangle(shape, 10, 20, 100, 50);
    expect(shape.data.commands).toEqual(['drawRectangle', 4, 10, 20, 100, 50]);
  });
});

describe('appendShapeRoundedRectangle', () => {
  it('pushes a drawRoundedRectangle command with position, dimensions, and radius', () => {
    const shape = createShape();
    appendShapeRoundedRectangle(shape, 0, 0, 100, 50, 20);
    expect(shape.data.commands).toEqual(['drawRoundedRectangle', 5, 0, 0, 100, 50, 20]);
  });
});

describe('appendShapeRoundedRectangleWithCornerRadii', () => {
  it('expands clockwise in top-left, top-right, bottom-right, bottom-left order', () => {
    const shape = createShape();
    appendShapeRoundedRectangleWithCornerRadii(shape, 0, 0, 100, 100, 10, 20, 30, 40);
    expect(shape.data.commands[0]).toBe('moveTo');
    expect(shape.data.commands.slice(2, 4)).toEqual([10, 0]);
    expect(shape.data.commands.slice(6, 8)).toEqual([80, 0]);
    expect(shape.data.commands.slice(14, 16)).toEqual([100, 20]);
    expect(shape.data.commands.slice(18, 20)).toEqual([100, 70]);
    expect(shape.data.commands.slice(26, 28)).toEqual([70, 100]);
    expect(shape.data.commands.slice(30, 32)).toEqual([40, 100]);
    expect(shape.data.commands.slice(38, 40)).toEqual([0, 60]);
    expect(shape.data.commands.slice(42, 44)).toEqual([0, 10]);
    expect(shape.data.commands.slice(50, 52)).toEqual([10, 0]);
  });
});

describe('appendShapeTangentArcTo', () => {
  function getShapeCommandKeys(shape: ReturnType<typeof createShape>): string[] {
    const keys: string[] = [];
    let i = 0;
    while (i < shape.data.commands.length) {
      keys.push(shape.data.commands[i] as string);
      i += (shape.data.commands[i + 1] as number) + 2;
    }
    return keys;
  }

  function getShapeLastPen(shape: ReturnType<typeof createShape>): [number, number] {
    const cmds = shape.data.commands;
    let px = 0;
    let py = 0;
    let i = 0;
    while (i < cmds.length) {
      const key = cmds[i] as string;
      const argCount = cmds[i + 1] as number;
      const b = i + 2;
      if (key === 'moveTo' || key === 'lineTo') {
        px = cmds[b] as number;
        py = cmds[b + 1] as number;
      } else if (key === 'quadraticCurveTo') {
        px = cmds[b + 2] as number;
        py = cmds[b + 3] as number;
      } else if (key === 'cubicCurveTo') {
        px = cmds[b + 4] as number;
        py = cmds[b + 5] as number;
      }
      i += argCount + 2;
    }
    return [px, py];
  }

  it('emits a lineTo followed by cubicCurveTo commands for a right-angle corner', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 100, 0);
    appendShapeTangentArcTo(shape, 100, 100, 0, 100, 20);
    const keys = getShapeCommandKeys(shape);
    expect(keys[0]).toBe('moveTo');
    expect(keys[1]).toBe('lineTo');
    expect(keys.slice(2).every((k) => k === 'cubicCurveTo')).toBe(true);
  });

  it('selects the short quarter-turn sweep for a clockwise right-angle corner', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeTangentArcTo(shape, 100, 0, 100, 100, 20);
    const [px, py] = getShapeLastPen(shape);
    expect(px).toBeCloseTo(100, 6);
    expect(py).toBeCloseTo(20, 6);
  });

  it('selects the short quarter-turn sweep for a counterclockwise right-angle corner', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeTangentArcTo(shape, 0, 100, 100, 100, 20);
    const [px, py] = getShapeLastPen(shape);
    expect(px).toBeCloseTo(20, 6);
    expect(py).toBeCloseTo(100, 6);
  });

  it('falls back to a lineTo when the tangent has zero length', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 100, 100);
    appendShapeTangentArcTo(shape, 100, 100, 200, 100, 10);
    const keys = getShapeCommandKeys(shape);
    expect(keys).toContain('lineTo');
    expect(keys.every((k) => k === 'moveTo' || k === 'lineTo')).toBe(true);
  });

  it('falls back to a lineTo when tangent lines are collinear', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeTangentArcTo(shape, 50, 0, 100, 0, 20);
    const keys = getShapeCommandKeys(shape);
    expect(keys.every((k) => k === 'moveTo' || k === 'lineTo')).toBe(true);
  });

  it('falls back to a lineTo when radius is zero or negative', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeTangentArcTo(shape, 100, 0, 100, 100, 0);
    const keys = getShapeCommandKeys(shape);
    expect(keys.every((k) => k === 'moveTo' || k === 'lineTo')).toBe(true);
  });
});

describe('PathCommand', () => {
  it('has expected numeric values', () => {
    expect(PathCommand.NO_OP).toBe(0);
    expect(PathCommand.MOVE_TO).toBe(1);
    expect(PathCommand.LINE_TO).toBe(2);
    expect(PathCommand.QUADRATIC_CURVE_TO).toBe(3);
    expect(PathCommand.WIDE_MOVE_TO).toBe(4);
    expect(PathCommand.WIDE_LINE_TO).toBe(5);
    expect(PathCommand.CUBIC_CURVE_TO).toBe(6);
  });
});
