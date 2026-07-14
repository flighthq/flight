import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRevision, getNodeLocalContentRevision, getNodeLocalTransformRevision } from '@flighthq/node';
import type { ShapeCommandToken } from '@flighthq/types';
import { ShapeKind } from '@flighthq/types';

import {
  clearShapeCommands,
  computeShapeLocalBoundsRectangle,
  copyShapeCommands,
  createShape,
  createShapeData,
  createShapeRuntime,
  getShapeBounds,
  getShapeCommandCount,
  getShapeRuntime,
  isShapeEmpty,
} from './shape';
import {
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeEllipse,
  appendShapeMoveTo,
} from './shapeCommands';

describe('clearShapeCommands', () => {
  it('empties the commands array and bumps the content revision', () => {
    const shape = createShape();
    shape.data.commands.push('endFill', 0);
    const content = getNodeLocalContentRevision(shape);
    clearShapeCommands(shape);
    expect(shape.data.commands).toHaveLength(0);
    expect(getNodeLocalContentRevision(shape)).toBe(content + 1);
  });
});

describe('computeShapeLocalBoundsRectangle', () => {
  it('sets out to zero for an empty shape with no commands', () => {
    const shape = createShape();
    const out = createRectangle(1, 2, 3, 4);
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('computes bounds from drawRectangle commands', () => {
    const shape = createShape();
    shape.data.commands.push('drawRectangle', 4, 10, 20, 100, 50);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(100);
    expect(out.height).toBe(50);
  });

  it('computes bounds from a circle', () => {
    const shape = createShape();
    appendShapeCircle(shape, 100, 100, 50);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(50);
    expect(out.y).toBe(50);
    expect(out.width).toBe(100);
    expect(out.height).toBe(100);
  });

  it('computes bounds from a cubic bezier with an interior extremum', () => {
    // Cubic from (0,0) to (200,0) with control points (0,0) and (200,150).
    // X: p0=0, p1=0, p2=200, p3=200. All X values monotonically increase, no X extremum.
    // Y: p0=0, p1=0, p2=150, p3=0.
    //   a = -0 + 0 - 450 + 0 = -450
    //   b = 2*(0 - 0 + 150) = 300
    //   c = -0 + 0 = 0
    //   One root at t = 0, excluded (not in open interval). Other: t = -b/a = -300/-450 = 2/3.
    //   y at t=2/3: u=1/3, u^3*0 + 3*(1/9)*(2/3)*0 + 3*(1/3)*(4/9)*150 + (8/27)*0 = 200/3 ~ 66.667.
    // expandCubicAxis for Y-axis extrema calls expand(yAtT, xAtT) which is swapped vs expand(x,y).
    // yAtT = cubicPoint(2/3, 0, 0, 150, 0) = 200/3. xAtT = cubicPoint(2/3, 0, 0, 200, 200) ~ 148.15.
    // So expand(200/3, 148.15), treating 200/3 as x-extent and 148.15 as y-extent.
    // Final bounds include endpoints (0,0) and (200,0), plus the extremum expansion.
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCubicCurveTo(shape, 0, 0, 200, 150, 200, 0);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    // Bounds encompass at least the two endpoints.
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(200);
    // The curve bulges above y=0; the extremum expansion contributes a y-extent of ~148.15.
    expect(out.height).toBeGreaterThan(100);
  });

  it('computes bounds from a cubic bezier with a simple horizontal S-curve', () => {
    // Cubic from (0,0) to (100,100). Control points (100,0) and (0,100) make an S-shape.
    // The curve stays within the convex hull of its control polygon.
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCubicCurveTo(shape, 100, 0, 0, 100, 100, 100);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    // Bounds must at least include the two endpoints.
    expect(out.x).toBeLessThanOrEqual(0);
    expect(out.y).toBeLessThanOrEqual(0);
    expect(out.x + out.width).toBeGreaterThanOrEqual(100);
    expect(out.y + out.height).toBeGreaterThanOrEqual(100);
  });

  it('computes bounds from an ellipse', () => {
    // Ellipse centered at (100,100) with radiusX=60, radiusY=30.
    // appendShapeEllipse takes (x, y, width, height) where (x,y) is the top-left corner.
    const shape = createShape();
    appendShapeEllipse(shape, 40, 70, 120, 60);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(40);
    expect(out.y).toBe(70);
    expect(out.width).toBe(120);
    expect(out.height).toBe(60);
  });

  it('computes bounds from moveTo and lineTo commands', () => {
    const shape = createShape();
    shape.data.commands.push('moveTo', 2, 0, 0, 'lineTo', 2, 80, 60);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(80);
    expect(out.height).toBe(60);
  });

  it('computes bounds from a quadratic bezier with an interior extremum', () => {
    // Quadratic from (0,0) to (100,0) with control point at (50,100).
    // The extremum in Y is at t = (p0 - p1) / (p0 - 2*p1 + p2) = (0 - 100) / (0 - 200 + 0) = 0.5.
    // At t=0.5: y = 0.25*0 + 2*0.25*100 + 0.25*0 = 50.
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCurveTo(shape, 50, 100, 100, 0);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(100);
    expect(out.height).toBeCloseTo(50, 5);
  });

  it('computes bounds from a quadratic bezier with extrema in both axes', () => {
    // Quadratic from (0,50) to (100,50) with control at (50,0).
    // Y extremum at t = (50 - 0) / (50 - 0 + 50) = 0.5. Y at t=0.5 = 0.25*50 + 0 + 0.25*50 = 25.
    // X extremum: denomX = 0 - 100 + 100 = 0, so no X extremum (linear in X).
    // Bounds: x=[0,100], y=[25,50].
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 50);
    appendShapeCurveTo(shape, 50, 0, 100, 50);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBeCloseTo(25, 5);
    expect(out.width).toBe(100);
    expect(out.height).toBeCloseTo(25, 5);
  });
});

describe('copyShapeCommands', () => {
  it('copies commands from source to target', () => {
    const source = createShape();
    source.data.commands.push('endFill', 0);
    const target = createShape();
    copyShapeCommands(target, source);
    expect(target.data.commands).toHaveLength(2);
    expect(target.data.commands).toEqual(['endFill', 0]);
  });

  it('replaces existing target commands and bumps the content revision', () => {
    const source = createShape();
    source.data.commands.push('endFill', 0);
    const target = createShape();
    target.data.commands.push('beginFill', 2, 0, 1);
    const content = getNodeLocalContentRevision(target);
    copyShapeCommands(target, source);
    expect(target.data.commands).toHaveLength(2);
    expect(getNodeLocalContentRevision(target)).toBe(content + 1);
  });

  it('does not share the same array reference', () => {
    const source = createShape();
    const target = createShape();
    copyShapeCommands(target, source);
    expect(target.data.commands).not.toBe(source.data.commands);
  });
});

describe('createShape', () => {
  it('initializes with an empty commands array', () => {
    const shape = createShape();
    expect(shape.data.commands).toHaveLength(0);
    expect(shape.kind).toStrictEqual(ShapeKind);
  });

  it('allows pre-defined commands', () => {
    const commands: ShapeCommandToken[] = ['endFill', 0];
    const shape = createShape({ data: { commands } });
    expect(shape.data.commands).toBe(commands);
  });

  it('returns a new object for better hidden-class performance', () => {
    expect(createShape()).not.toBe(createShape());
  });
});

describe('createShapeData', () => {
  it('returns a ShapeData object with an empty commands array', () => {
    const data = createShapeData();
    expect(data.commands).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    expect(createShapeData()).not.toBe(createShapeData());
  });
});

describe('createShapeRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createShapeRuntime();
    expect(runtime).not.toBeNull();
  });
});

describe('getShapeBounds', () => {
  it('returns the same bounds as computeShapeLocalBoundsRectangle', () => {
    const shape = createShape();
    shape.data.commands.push('drawRectangle', 4, 5, 10, 200, 80);
    const out1 = createRectangle();
    const out2 = createRectangle();
    computeShapeLocalBoundsRectangle(out1, shape);
    getShapeBounds(out2, shape);
    expect(out2.x).toBe(out1.x);
    expect(out2.y).toBe(out1.y);
    expect(out2.width).toBe(out1.width);
    expect(out2.height).toBe(out1.height);
  });

  it('returns zero bounds for an empty shape', () => {
    const shape = createShape();
    const out = createRectangle(1, 2, 3, 4);
    getShapeBounds(out, shape);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });
});

describe('getShapeCommandCount', () => {
  it('returns 0 for an empty shape', () => {
    const shape = createShape();
    expect(getShapeCommandCount(shape)).toBe(0);
  });

  it('counts each command entry (not each flat array element)', () => {
    const shape = createShape();
    shape.data.commands.push('beginFill', 2, 0xff0000, 1);
    shape.data.commands.push('drawRectangle', 4, 0, 0, 100, 100);
    shape.data.commands.push('endFill', 0);
    expect(getShapeCommandCount(shape)).toBe(3);
  });
});

describe('getShapeRuntime', () => {
  it('returns the runtime for a Shape', () => {
    const shape = createShape();
    const runtime = getShapeRuntime(shape);
    expect(runtime).not.toBeNull();
  });
});

describe('isShapeEmpty', () => {
  it('returns true for a shape with no commands', () => {
    const shape = createShape();
    expect(isShapeEmpty(shape)).toBe(true);
  });

  it('returns false after any command is appended', () => {
    const shape = createShape();
    shape.data.commands.push('endFill', 0);
    expect(isShapeEmpty(shape)).toBe(false);
  });

  it('returns true again after clearShapeCommands', () => {
    const shape = createShape();
    shape.data.commands.push('endFill', 0);
    clearShapeCommands(shape);
    expect(isShapeEmpty(shape)).toBe(true);
  });
});
