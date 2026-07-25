import { PathCommand } from '@flighthq/types';

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
import { appendShapeGeometryCommand, getShapeFillRegions, hasNonSolidShapeFill, hasShapeFill } from './shapeFill';

describe('appendShapeGeometryCommand', () => {
  it('appends polyline verbs and expands primitives, ignoring non-geometry names', () => {
    const path = { commands: [] as number[], data: [] as number[], winding: 'nonZero' as const };
    appendShapeGeometryCommand(path, 'moveTo', ['moveTo', 2, 5, 6], 2);
    appendShapeGeometryCommand(path, 'lineTo', ['lineTo', 2, 7, 8], 2);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(path.data).toEqual([5, 6, 7, 8]);

    // A rectangle primitive expands into MOVE + 4 LINE verbs.
    const rect = { commands: [] as number[], data: [] as number[], winding: 'nonZero' as const };
    appendShapeGeometryCommand(rect, 'drawRectangle', ['drawRectangle', 4, 0, 0, 10, 10], 2);
    expect(rect.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
    ]);

    // A styling command name is a no-op.
    const noop = { commands: [] as number[], data: [] as number[], winding: 'nonZero' as const };
    appendShapeGeometryCommand(noop, 'beginFill', ['beginFill', 2, 0xff0000, 1], 2);
    expect(noop.commands).toEqual([]);
  });
});

describe('getShapeFillRegions', () => {
  it('resolves a solid rectangle fill into one region with a closed outline', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, 10, 20, 100, 50);
    appendShapeEndFill(shape);

    const regions = getShapeFillRegions(shape.data.commands);

    expect(regions).not.toBeNull();
    expect(regions!.length).toBe(1);
    expect(regions![0].color).toBe(0xff0000);
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
    appendShapeBeginFill(shape, 0x00ff00);
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
    appendShapeBeginFill(shape, 0x0000ff);
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
    appendShapeBeginFill(shape, 0x111111);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeBeginFill(shape, 0x222222);
    appendShapeRectangle(shape, 20, 20, 10, 10);
    appendShapeEndFill(shape);

    const regions = getShapeFillRegions(shape.data.commands)!;
    expect(regions.map((r) => r.color)).toEqual([0x111111, 0x222222]);
  });

  it('returns null for a gradient fill (falls back to raster)', () => {
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);

    expect(getShapeFillRegions(shape.data.commands)).toBeNull();
  });

  it('returns null when a stroke is present', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000);
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);

    expect(getShapeFillRegions(shape.data.commands)).toBeNull();
  });
});

describe('hasNonSolidShapeFill', () => {
  it('is false for solid fills only', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    expect(hasNonSolidShapeFill(shape.data.commands)).toBe(false);
  });

  it('is true when a bitmap or gradient fill or stroke is present', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 1, 0);
    expect(hasNonSolidShapeFill(shape.data.commands)).toBe(true);
  });
});

describe('hasShapeFill', () => {
  it('is true when a fill is declared and false for a stroke-only shape', () => {
    const filled = createShape();
    appendShapeBeginFill(filled, 0xff0000);
    appendShapeRectangle(filled, 0, 0, 10, 10);
    expect(hasShapeFill(filled.data.commands)).toBe(true);

    const strokeOnly = createShape();
    appendShapeLineStyle(strokeOnly, 2, 0);
    appendShapeMoveTo(strokeOnly, 0, 0);
    appendShapeLineTo(strokeOnly, 10, 0);
    expect(hasShapeFill(strokeOnly.data.commands)).toBe(false);
  });
});
