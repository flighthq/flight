import type { ShapeCommandToken } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createShape } from './shape';
import { appendShapeLineStyle, appendShapeLineTo, appendShapeMoveTo } from './shapeCommands';
import { getShapeStrokeRegions, hasNonSolidShapeStroke } from './shapeStroke';

// A 90° corner stroked with the given join, as one span.
function strokedCorner(join: 'bevel' | 'miter' | 'round', thickness = 20) {
  const shape = createShape();
  appendShapeLineStyle(shape, thickness, 0x112233, 0.5, false, 'normal', 'none', join, 6);
  appendShapeMoveTo(shape, 0, 0);
  appendShapeLineTo(shape, 100, 0);
  appendShapeLineTo(shape, 100, 100);
  return getShapeStrokeRegions(shape.data.commands);
}

describe('getShapeStrokeRegions', () => {
  it('offsets a solid stroke span into one fillable outline region carrying its color + alpha', () => {
    const regions = strokedCorner('miter');
    expect(regions).not.toBeNull();
    expect(regions!.length).toBe(1);
    expect(regions![0].color).toBe(0x112233);
    expect(regions![0].alpha).toBe(0.5);
    // A real outline: closed contour(s) with MOVE + fill geometry, not empty.
    expect(regions![0].path.commands.length).toBeGreaterThan(0);
    expect(regions![0].path.commands[0]).toBe(PathCommand.MOVE_TO);
  });

  it('differentiates join styles (miter vs bevel vs round produce distinct outlines)', () => {
    const miter = strokedCorner('miter')![0].path.data.length;
    const bevel = strokedCorner('bevel')![0].path.data.length;
    const round = strokedCorner('round')![0].path.data.length;
    // The corner geometry differs per join: bevel cuts the corner, round arcs it (more points), miter
    // extends it. If joins were ignored (the old raster-clip bug) these would be identical.
    expect(miter).not.toBe(bevel);
    expect(round).toBeGreaterThan(bevel);
  });

  it('emits no region for a cleared stroke (lineStyle thickness 0) and for a stroke-free shape', () => {
    const cleared = createShape();
    appendShapeLineStyle(cleared, 0);
    appendShapeMoveTo(cleared, 0, 0);
    appendShapeLineTo(cleared, 50, 0);
    expect(getShapeStrokeRegions(cleared.data.commands)).toEqual([]);

    const strokeFree = createShape();
    appendShapeMoveTo(strokeFree, 0, 0);
    appendShapeLineTo(strokeFree, 50, 0);
    expect(getShapeStrokeRegions(strokeFree.data.commands)).toEqual([]);
  });

  it('closes each span and re-strokes on a new lineStyle (two spans → two regions)', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 10, 0xff0000, 1, false, 'normal', 'none', 'miter', 6);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 50, 0);
    appendShapeLineStyle(shape, 4, 0x00ff00, 1, false, 'normal', 'round', 'round', 6);
    appendShapeMoveTo(shape, 0, 20);
    appendShapeLineTo(shape, 50, 20);
    const regions = getShapeStrokeRegions(shape.data.commands);
    expect(regions!.length).toBe(2);
    expect(regions![0].color).toBe(0xff0000);
    expect(regions![1].color).toBe(0x00ff00);
  });

  it('defers a gradient/bitmap stroke to the raster path (null)', () => {
    const gradientStroke: ShapeCommandToken[] = ['lineGradientStyle', 1, 0, 'moveTo', 2, 0, 0, 'lineTo', 2, 50, 0];
    expect(getShapeStrokeRegions(gradientStroke)).toBeNull();
  });
});

describe('hasNonSolidShapeStroke', () => {
  it('is true only for a gradient or bitmap stroke, not a solid lineStyle', () => {
    const solid = createShape();
    appendShapeLineStyle(solid, 3);
    expect(hasNonSolidShapeStroke(solid.data.commands)).toBe(false);
    expect(hasNonSolidShapeStroke(['lineGradientStyle', 1, 0] as ShapeCommandToken[])).toBe(true);
    expect(hasNonSolidShapeStroke(['lineBitmapStyle', 1, 0] as ShapeCommandToken[])).toBe(true);
  });
});
