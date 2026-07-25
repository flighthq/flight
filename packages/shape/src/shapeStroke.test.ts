import { tessellatePath } from '@flighthq/path';
import type { ShapeCommandToken } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';
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

  it('tessellates an OPEN stroke outline into a fillable (non-empty) mesh', () => {
    const outline = strokedCorner('miter')![0].path;
    // The V's outline is a simple polygon: ear-clipping fills it (indices > 0). A closed stroke's ring
    // could not be direct-filled, which is why closed strokes defer (next test).
    const mesh = tessellatePath(outline);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });

  it('defers a CLOSED stroke (rectangle) to the raster path — a ring is not direct-fillable (null)', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 8, 0xff0000, 1, false, 'normal', 'none', 'miter', 4);
    appendShapeRectangle(shape, 10, 10, 100, 50);
    expect(getShapeStrokeRegions(shape.data.commands)).toBeNull();
  });

  it('defers a stroked drawPath carrying a CLOSE verb (null)', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 6, 0x0000ff, 1, false, 'normal', 'none', 'miter', 4);
    // A triangle subpath closed by an explicit CLOSE verb — a ring, not an open stroke.
    const verbs = [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE];
    appendShapePath(shape, verbs, [0, 0, 40, 0, 20, 30], 'nonZero');
    expect(getShapeStrokeRegions(shape.data.commands)).toBeNull();
  });

  it('defers a stroked return-to-start polygon (appendShapePolygon) even without a CLOSE verb (null)', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 6, 0x0000ff, 1, false, 'normal', 'none', 'miter', 4);
    // appendShapePolygon re-emits the first point as a trailing lineTo (return-to-start), no CLOSE verb.
    appendShapePolygon(shape, [0, 0, 50, 0, 25, 40]);
    expect(getShapeStrokeRegions(shape.data.commands)).toBeNull();
  });

  it('ignores an UNSTROKED closed primitive and still strokes a later open line (span-aware)', () => {
    const shape = createShape();
    // Rectangle drawn with no active lineStyle — it never reaches a centerline, so it must NOT force the
    // whole shape to the raster fallback. The later open stroked line still yields one region.
    appendShapeRectangle(shape, 0, 0, 100, 50);
    appendShapeLineStyle(shape, 6, 0xff0000, 1, false, 'normal', 'none', 'miter', 4);
    appendShapeMoveTo(shape, 10, 80);
    appendShapeLineTo(shape, 90, 80);
    const regions = getShapeStrokeRegions(shape.data.commands);
    expect(regions).not.toBeNull();
    expect(regions!.length).toBe(1);
    expect(regions![0].color).toBe(0xff0000);
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
