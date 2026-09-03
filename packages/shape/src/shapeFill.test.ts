import { EntityRuntimeKey, PathCommand } from '@flighthq/types/contract';

import { createShape } from './shape';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
} from './shapeCommands';
import {
  appendShapeGeometryCommand,
  getPathCommandOperandCount,
  getShapeFillRegions,
  hasNonSolidShapeFill,
  hasShapeFill,
} from './shapeFill';

describe('appendShapeGeometryCommand', () => {
  it('appends polyline verbs and expands primitives, ignoring non-geometry names', () => {
    const path = {
      [EntityRuntimeKey]: undefined,
      commands: [] as number[],
      data: [] as number[],
      winding: 'nonZero' as const,
    };
    appendShapeGeometryCommand(path, 'moveTo', ['moveTo', 2, 5, 6], 2);
    appendShapeGeometryCommand(path, 'lineTo', ['lineTo', 2, 7, 8], 2);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(path.data).toEqual([5, 6, 7, 8]);

    // A rectangle primitive expands into MOVE + 4 LINE verbs.
    const rect = {
      [EntityRuntimeKey]: undefined,
      commands: [] as number[],
      data: [] as number[],
      winding: 'nonZero' as const,
    };
    appendShapeGeometryCommand(rect, 'drawRectangle', ['drawRectangle', 4, 0, 0, 10, 10], 2);
    expect(rect.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
    ]);

    // A styling command name is a no-op.
    const noop = {
      [EntityRuntimeKey]: undefined,
      commands: [] as number[],
      data: [] as number[],
      winding: 'nonZero' as const,
    };
    appendShapeGeometryCommand(noop, 'beginFill', ['beginFill', 2, 0xff0000ff, 1], 2);
    expect(noop.commands).toEqual([]);
  });

  it('keeps the data cursor aligned across a raw CLOSE between drawPath subpaths', () => {
    // A drawPath with two subpaths separated by a CLOSE verb. CLOSE consumes 0 operands: if it were
    // parsed as 2, the second subpath's coordinates would shift.
    const path = {
      [EntityRuntimeKey]: undefined,
      commands: [] as number[],
      data: [] as number[],
      winding: 'nonZero' as const,
    };
    const verbs = [
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
    ];
    const raw = [0, 0, 10, 0, 20, 20, 30, 20];
    appendShapeGeometryCommand(path, 'drawPath', ['drawPath', 3, verbs, raw, 'nonZero'], 2);
    expect(path.commands).toEqual(verbs);
    // The second subpath still reads (20,20)->(30,20); CLOSE contributed no data.
    expect(path.data).toEqual([0, 0, 10, 0, 20, 20, 30, 20]);
  });
});

describe('getPathCommandOperandCount', () => {
  it('reports operand width per verb (MOVE/LINE 2, CURVE/WIDE 4, CUBIC 6, CLOSE/NO_OP 0)', () => {
    expect(getPathCommandOperandCount(PathCommand.MOVE_TO)).toBe(2);
    expect(getPathCommandOperandCount(PathCommand.LINE_TO)).toBe(2);
    expect(getPathCommandOperandCount(PathCommand.CURVE_TO)).toBe(4);
    expect(getPathCommandOperandCount(PathCommand.WIDE_MOVE_TO)).toBe(4);
    expect(getPathCommandOperandCount(PathCommand.WIDE_LINE_TO)).toBe(4);
    expect(getPathCommandOperandCount(PathCommand.CUBIC_CURVE_TO)).toBe(6);
    expect(getPathCommandOperandCount(PathCommand.CLOSE)).toBe(0);
    expect(getPathCommandOperandCount(PathCommand.NO_OP)).toBe(0);
  });
});

describe('getShapeFillRegions', () => {
  it('resolves a solid rectangle fill into one region with a closed outline', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 1);
    appendShapeRectangle(shape, 10, 20, 100, 50);
    appendShapeEndFill(shape);

    const regions = getShapeFillRegions(shape.data.commands);

    expect(regions).not.toBeNull();
    expect(regions!.length).toBe(1);
    expect(regions![0].color).toBe(0xff0000ff);
    expect(regions![0].alpha).toBe(1);
    expect(regions![0].path.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
    ]);
    expect(regions![0].path.data.slice(0, 4)).toEqual([10, 20, 110, 20]);
  });

  it('expands a circle into four cubic curves', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0x00ff00ff);
    appendShapeCircle(shape, 50, 50, 20);
    appendShapeEndFill(shape);

    const regions = getShapeFillRegions(shape.data.commands)!;
    expect(regions[0].path.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
    ]);
    // Starts at the rightmost point (cx + r, cy).
    expect(regions[0].path.data.slice(0, 2)).toEqual([70, 50]);
  });

  it('resolves a moveTo/lineTo polygon fill', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0x0000ffff);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeLineTo(shape, 50, 80);
    appendShapeEndFill(shape);

    const regions = getShapeFillRegions(shape.data.commands)!;
    expect(regions.length).toBe(1);
    expect(regions[0].path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
  });

  it('returns a region per fill span when fills are not explicitly ended', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0x111111ff);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeBeginFill(shape, 0x222222ff);
    appendShapeRectangle(shape, 20, 20, 10, 10);
    appendShapeEndFill(shape);

    const regions = getShapeFillRegions(shape.data.commands)!;
    expect(regions.map((r) => r.color)).toEqual([0x111111ff, 0x222222ff]);
  });

  it('returns null for a gradient fill (falls back to raster)', () => {
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'linear', [0xff0000ff, 0x0000ffff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);

    expect(getShapeFillRegions(shape.data.commands)).toBeNull();
  });

  it('resolves solid fills independently of a solid stroke', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000ff);
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);

    const regions = getShapeFillRegions(shape.data.commands);
    expect(regions).not.toBeNull();
    expect(regions).toHaveLength(1);
    expect(regions![0].color).toBe(0xff0000ff);
  });
});

describe('hasNonSolidShapeFill', () => {
  it('is false for solid fills only', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    expect(hasNonSolidShapeFill(shape.data.commands)).toBe(false);
  });

  it('is false for a solid stroke and true for a bitmap or gradient style', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 1, 0x000000ff);
    expect(hasNonSolidShapeFill(shape.data.commands)).toBe(false);

    appendShapeBeginGradientFill(shape, 'linear', [0xff0000ff, 0x0000ffff], [1, 1], [0, 255]);
    expect(hasNonSolidShapeFill(shape.data.commands)).toBe(true);
  });
});

describe('hasShapeFill', () => {
  it('is true when a fill is declared and false for a stroke-only shape', () => {
    const filled = createShape();
    appendShapeBeginFill(filled, 0xff0000ff);
    appendShapeRectangle(filled, 0, 0, 10, 10);
    expect(hasShapeFill(filled.data.commands)).toBe(true);

    const strokeOnly = createShape();
    appendShapeLineStyle(strokeOnly, 2, 0x000000ff);
    appendShapeMoveTo(strokeOnly, 0, 0);
    appendShapeLineTo(strokeOnly, 10, 0);
    expect(hasShapeFill(strokeOnly.data.commands)).toBe(false);
  });
});
