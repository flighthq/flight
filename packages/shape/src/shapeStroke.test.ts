import { tessellateStrokePath } from '@flighthq/path/contract';
import type { ShapeCommandToken } from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createShape } from './shape';
import {
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapePolygon,
  appendShapeRectangle,
} from './shapeCommands';
import { getShapeStrokeRegions, hasNonSolidShapeStroke } from './shapeStroke';

// A 90° corner stroked with the given join, as one span.
function strokedCorner(join: 'bevel' | 'miter' | 'round', thickness = 20) {
  const shape = createShape();
  appendShapeLineStyle(shape, thickness, 0x112233ff, 0.5, false, 'normal', 'none', join, 6);
  appendShapeMoveTo(shape, 0, 0);
  appendShapeLineTo(shape, 100, 0);
  appendShapeLineTo(shape, 100, 100);
  return getShapeStrokeRegions(shape.data.commands);
}

describe('getShapeStrokeRegions', () => {
  it('resolves a solid stroke span into one styled centerline carrying its color + alpha', () => {
    const regions = strokedCorner('miter');
    expect(regions).not.toBeNull();
    expect(regions!.length).toBe(1);
    expect(regions![0].color).toBe(0x112233ff);
    expect(regions![0].alpha).toBe(0.5);
    expect(regions![0].style).toMatchObject({ width: 20, join: 'miter', cap: 'butt' });
    expect(regions![0].path.commands.length).toBeGreaterThan(0);
    expect(regions![0].path.commands[0]).toBe(PathCommand.MOVE_TO);
  });

  it('preserves miter, bevel, and round styles for the shared stroke tessellator', () => {
    expect(strokedCorner('miter')![0].style.join).toBe('miter');
    expect(strokedCorner('bevel')![0].style.join).toBe('bevel');
    expect(strokedCorner('round')![0].style.join).toBe('round');
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
    appendShapeLineStyle(shape, 10, 0xff0000ff, 1, false, 'normal', 'none', 'miter', 6);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 50, 0);
    appendShapeLineStyle(shape, 4, 0x00ff00ff, 1, false, 'normal', 'round', 'round', 6);
    appendShapeMoveTo(shape, 0, 20);
    appendShapeLineTo(shape, 50, 20);
    const regions = getShapeStrokeRegions(shape.data.commands);
    expect(regions!.length).toBe(2);
    expect(regions![0].color).toBe(0xff0000ff);
    expect(regions![1].color).toBe(0x00ff00ff);
  });

  it('tessellates an open styled centerline into a non-empty mesh', () => {
    const region = strokedCorner('miter')![0];
    const mesh = tessellateStrokePath(region.path, region.style);
    expect(mesh).not.toBeNull();
    expect(mesh!.indices.length).toBeGreaterThan(0);
  });

  it('resolves and tessellates a closed rectangle as a hollow ring', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000ff, 1, false, 'normal', 'none', 'miter', 4);
    appendShapeRectangle(shape, 10, 10, 100, 50);
    const region = getShapeStrokeRegions(shape.data.commands)![0];
    expect(tessellateStrokePath(region.path, region.style)).not.toBeNull();
  });

  it('resolves a stroked drawPath carrying a CLOSE verb', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 6, 0x0000ffff, 1, false, 'normal', 'none', 'miter', 4);
    // A triangle subpath closed by an explicit CLOSE verb — a ring, not an open stroke.
    const verbs = [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE];
    appendShapePath(shape, verbs, [0, 0, 40, 0, 20, 30], 'nonZero');
    const region = getShapeStrokeRegions(shape.data.commands)![0];
    expect(tessellateStrokePath(region.path, region.style)).not.toBeNull();
  });

  it('resolves a stroked return-to-start polygon without a CLOSE verb', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 6, 0x0000ffff, 1, false, 'normal', 'none', 'miter', 4);
    // appendShapePolygon re-emits the first point as a trailing lineTo (return-to-start), no CLOSE verb.
    appendShapePolygon(shape, [0, 0, 50, 0, 25, 40]);
    const region = getShapeStrokeRegions(shape.data.commands)![0];
    expect(tessellateStrokePath(region.path, region.style)).not.toBeNull();
  });

  it('keeps a pathological centerline as a region so the renderer can select raster fallback', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 6, 0x0000ffff, 1, false, 'normal', 'none', 'miter', 4);
    appendShapePath(
      shape,
      [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE],
      [0, 0, 40, 40, 0, 40, 40, 0],
      'nonZero',
    );
    const region = getShapeStrokeRegions(shape.data.commands)![0];
    expect(tessellateStrokePath(region.path, region.style)).toBeNull();
  });

  it('ignores an UNSTROKED closed primitive and still strokes a later open line (span-aware)', () => {
    const shape = createShape();
    // Rectangle drawn with no active lineStyle — it never reaches a centerline, so it must NOT force the
    // whole shape to the raster fallback. The later open stroked line still yields one region.
    appendShapeRectangle(shape, 0, 0, 100, 50);
    appendShapeLineStyle(shape, 6, 0xff0000ff, 1, false, 'normal', 'none', 'miter', 4);
    appendShapeMoveTo(shape, 10, 80);
    appendShapeLineTo(shape, 90, 80);
    const regions = getShapeStrokeRegions(shape.data.commands);
    expect(regions).not.toBeNull();
    expect(regions!.length).toBe(1);
    expect(regions![0].color).toBe(0xff0000ff);
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
    expect(hasNonSolidShapeStroke(['lineTextureStyle', 1, 0] as ShapeCommandToken[])).toBe(true);
  });
});
