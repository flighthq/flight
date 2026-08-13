import { createRectangle } from '@flighthq/geometry/contract';
import {
  getNodeLocalBoundsRevision,
  getNodeLocalContentRevision,
  getNodeLocalTransformRevision,
} from '@flighthq/node/contract';
import { createPath, createPathMorph } from '@flighthq/path/contract';
import type { ShapeCommandToken } from '@flighthq/types/contract';
import { ShapeKind } from '@flighthq/types/contract';

import { createMorphShape, setMorphShapeProgress } from './morphShape';
import { appendMorphShapeBeginFill } from './morphShapePaint';
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
  defaultShapeBoundsCubicCurveTo,
  defaultShapeBoundsCurveTo,
  defaultShapeBoundsDrawCircle,
  defaultShapeBoundsDrawEllipse,
  defaultShapeBoundsDrawRectangle,
  defaultShapeBoundsLineStyle,
  defaultShapeBoundsLineTo,
  defaultShapeBoundsMoveTo,
} from './shapeBounds';
import { registerShapeBoundsCommand } from './shapeBoundsRegistry';
import {
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeEllipse,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
} from './shapeCommands';

beforeAll(() => {
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsDrawRectangle,
    key: 'drawRectangle',
    strokeBounds: defaultShapeBoundsDrawRectangle,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsDrawCircle,
    key: 'drawCircle',
    strokeBounds: defaultShapeBoundsDrawCircle,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsDrawEllipse,
    key: 'drawEllipse',
    strokeBounds: defaultShapeBoundsDrawEllipse,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsMoveTo,
    key: 'moveTo',
    strokeBounds: defaultShapeBoundsMoveTo,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsLineTo,
    key: 'lineTo',
    strokeBounds: defaultShapeBoundsLineTo,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsCurveTo,
    key: 'curveTo',
    strokeBounds: defaultShapeBoundsCurveTo,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsCubicCurveTo,
    key: 'cubicCurveTo',
    strokeBounds: defaultShapeBoundsCubicCurveTo,
  });
  registerShapeBoundsCommand({
    fillBounds: null,
    key: 'lineStyle',
    strokeBounds: defaultShapeBoundsLineStyle,
  });
});

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
    // Final bounds include endpoints (0,0) and (200,0), plus the exact Y extremum at 200/3.
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCubicCurveTo(shape, 0, 0, 200, 150, 200, 0);
    const out = createRectangle();
    computeShapeLocalBoundsRectangle(out, shape as any);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(200);
    expect(out.height).toBeCloseTo(200 / 3, 5);
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

  it('includes a miter point beyond the half-width endpoint envelope', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 30, 0xffffff, 1, false, 'normal', 'none', 'miter', 6);
    appendShapeMoveTo(shape, -110, -110);
    appendShapeLineTo(shape, 0, 0);
    appendShapeLineTo(shape, 110, -110);
    const out = createRectangle();

    computeShapeLocalBoundsRectangle(out, shape as any);

    expect(out.y + out.height).toBeGreaterThan(18);
  });

  it('bounds a closed rectangle stroke without applying the miter limit to every axis', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 30, 0xffffff, 1, false, 'normal', 'none', 'miter', 6);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const out = createRectangle();

    computeShapeLocalBoundsRectangle(out, shape as any);

    expect(out).toMatchObject({ height: 130, width: 130, x: -15, y: -15 });
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
  it('discards target paint bindings when replacing a MorphShape command stream', () => {
    const path = createPath();
    const target = createMorphShape(createPathMorph(path, path)!);
    appendMorphShapeBeginFill(target, { color: 0 }, { color: 0xffffff });
    const source = createShape({ data: { commands: ['beginFill', 2, 0x123456, 1] } });

    copyShapeCommands(target, source);
    setMorphShapeProgress(target, 1);

    expect(target.data.commands).toStrictEqual(['beginFill', 2, 0x123456, 1]);
    expect(target.data.paintBindings).toStrictEqual([]);
  });

  it('copies commands from source to target', () => {
    const source = createShape();
    source.data.commands.push('endFill', 0);
    const target = createShape();
    copyShapeCommands(target, source);
    expect(target.data.commands).toHaveLength(2);
    expect(target.data.commands).toEqual(['endFill', 0]);
  });

  it('copies a command stream longer than the engine argument limit', () => {
    // Imported vector artwork reaches this length routinely, and a spread into push would pass one
    // argument per command — so this is the size at which copying, not drawing, is what fails.
    const source = createShape();
    for (let i = 0; i < 400_000; i++) source.data.commands.push('lineTo', 2, i, i);
    const target = createShape();

    expect(() => copyShapeCommands(target, source)).not.toThrow();
    expect(target.data.commands).toHaveLength(source.data.commands.length);
    expect(target.data.commands[1_599_998]).toBe(399_999);
  });

  it('leaves the command stream intact when target and source are the same shape', () => {
    const shape = createShape();
    shape.data.commands.push('endFill', 0);
    copyShapeCommands(shape, shape);
    expect(shape.data.commands).toEqual(['endFill', 0]);
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
