import { createRectangle } from '@flighthq/geometry/contract';
import { PathCommand } from '@flighthq/types/contract';

import { registerDefaultShapeBoundsCommands } from './registerDefaultShapeBoundsCommands';
import { createShape } from './shape';
import {
  computeShapeBoundsRectangle,
  defaultShapeBoundsCubicCurveTo,
  defaultShapeBoundsCurveTo,
  defaultShapeBoundsDrawCircle,
  defaultShapeBoundsDrawEllipse,
  defaultShapeBoundsDrawPath,
  defaultShapeBoundsDrawRectangle,
  defaultShapeBoundsExpandPointPairs,
  defaultShapeBoundsFlush,
  defaultShapeBoundsLineStyle,
  defaultShapeBoundsLineTo,
  defaultShapeBoundsMoveTo,
  explainShapeBounds,
  normalizeShapeStrokeMiterLimit,
  normalizeShapeStrokeWidth,
  setShapeBoundsGuard,
} from './shapeBounds';
import { registerShapeBoundsCommand } from './shapeBoundsRegistry';
import {
  appendShapeBeginFill,
  appendShapeCubicCurveTo,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapeRectangle,
} from './shapeCommands';

beforeAll(() => {
  registerDefaultShapeBoundsCommands();
});

describe('computeShapeBoundsRectangle', () => {
  it('returns false for an unknown command without inventing geometry', () => {
    const shape = createShape({ data: { commands: ['__test.missing__', 2, 1, 2] } });
    const out = createRectangle(10, 20, 30, 40);

    expect(computeShapeBoundsRectangle(out, shape)).toBe(false);
    expect(out).toMatchObject({ height: 0, width: 0, x: 0, y: 0 });
  });

  it('keeps known contributions while reporting an incomplete stream', () => {
    const shape = createShape();
    appendShapeRectangle(shape, 10, 20, 30, 40);
    shape.data.commands.push('__test.missing-after-known__', 0);
    const out = createRectangle();

    expect(computeShapeBoundsRectangle(out, shape)).toBe(false);
    expect(out).toMatchObject({ height: 40, width: 30, x: 10, y: 20 });
  });

  it('selects fill-only or ink-inclusive contributions from the same command binding', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 10, 0x000000ff);
    appendShapeRectangle(shape, 0, 0, 100, 50);
    const fill = createRectangle();
    const ink = createRectangle();

    expect(computeShapeBoundsRectangle(fill, shape, 'fill')).toBe(true);
    expect(computeShapeBoundsRectangle(ink, shape, 'ink')).toBe(true);

    expect(fill).toMatchObject({ height: 50, width: 100, x: 0, y: 0 });
    expect(ink).toMatchObject({ height: 60, width: 110, x: -5, y: -5 });
  });

  it('resolves a miter from adjacent segment summaries', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 30, 0, 1, false, 'normal', 'none', 'miter', 6);
    appendShapeMoveTo(shape, -110, -110);
    appendShapeLineTo(shape, 0, 0);
    appendShapeLineTo(shape, 110, -110);
    const out = createRectangle();

    computeShapeBoundsRectangle(out, shape);

    expect(out.y + out.height).toBeGreaterThan(18);
  });

  it('falls back to the half-width bevel envelope beyond the authored miter limit', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 30, 0, 1, false, 'normal', 'none', 'miter', 1);
    appendShapeMoveTo(shape, -110, -110);
    appendShapeLineTo(shape, 0, 0);
    appendShapeLineTo(shape, 110, -110);
    const out = createRectangle();

    computeShapeBoundsRectangle(out, shape);

    expect(out.y + out.height).toBeCloseTo(15);
  });

  it('includes square cap extension for an open stroke', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 10, 0, 1, false, 'normal', 'square');
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    const out = createRectangle();

    computeShapeBoundsRectangle(out, shape);

    expect(out).toMatchObject({ height: 10, width: 110, x: -5, y: -5 });
  });

  it('tracks CLOSE as the final segment and last-to-first join', () => {
    const shape = createShape();
    appendShapeLineStyle(shape, 10, 0, 1, false, 'normal', 'none', 'miter', 4);
    appendShapePath(
      shape,
      [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE],
      [0, 0, 100, 0, 50, 100],
    );
    const out = createRectangle();

    computeShapeBoundsRectangle(out, shape);

    expect(out.x).toBeLessThan(0);
    expect(out.y + out.height).toBeGreaterThan(100);
  });

  it('uses the correct axes for cubic extrema', () => {
    const shape = createShape();
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCubicCurveTo(shape, 0, 0, 200, 150, 200, 0);
    const out = createRectangle();

    computeShapeBoundsRectangle(out, shape, 'fill');

    expect(out).toMatchObject({ width: 200, x: 0, y: 0 });
    expect(out.height).toBeCloseTo(200 / 3, 5);
  });

  it('passes only the registered command arguments through the reusable cursor', () => {
    const key = '__test.cursor__';
    const seen: unknown[] = [];
    registerShapeBoundsCommand({
      fillBounds: (context, command) => {
        seen.push(command.length, command.getArgument(-1), command.getArgument(0), command.getArgument(2));
        context.expandPoint(command.getArgument(0) as number, command.getArgument(1) as number);
      },
      key: key as never,
      strokeBounds: null,
    });
    const shape = createShape({ data: { commands: [key, 2, 7, 9, 'drawRectangle', 4, 0, 0, 1, 1] } });
    const out = createRectangle();

    computeShapeBoundsRectangle(out, shape, 'fill');

    expect(seen).toEqual([2, undefined, 7, undefined]);
    expect(out).toMatchObject({ height: 9, width: 7, x: 0, y: 0 });
  });
});

describe('defaultShapeBoundsCubicCurveTo', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsCubicCurveTo).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsCurveTo', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsCurveTo).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsDrawCircle', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsDrawCircle).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsDrawEllipse', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsDrawEllipse).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsDrawPath', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsDrawPath).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsDrawRectangle', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsDrawRectangle).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsExpandPointPairs', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsExpandPointPairs).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsFlush', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsFlush).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsLineStyle', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsLineStyle).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsLineTo', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsLineTo).toBeTypeOf('function');
  });
});

describe('defaultShapeBoundsMoveTo', () => {
  it('is available for paired command registration', () => {
    expect(defaultShapeBoundsMoveTo).toBeTypeOf('function');
  });
});

describe('explainShapeBounds', () => {
  it('reports each missing key once without diagnostic prose in the core traversal', () => {
    const shape = createShape({
      data: { commands: ['__test.a__', 0, '__test.b__', 0, '__test.a__', 0] },
    });

    expect(explainShapeBounds(shape, 'fill')).toEqual({
      complete: false,
      missingCommandKeys: ['__test.a__', '__test.b__'],
      mode: 'fill',
    });
  });
});

describe('normalizeShapeStrokeMiterLimit', () => {
  it('uses Canvas default 10 for nonpositive or nonfinite values', () => {
    expect(normalizeShapeStrokeMiterLimit(0)).toBe(10);
    expect(normalizeShapeStrokeMiterLimit(-2)).toBe(10);
    expect(normalizeShapeStrokeMiterLimit(Infinity)).toBe(10);
    expect(normalizeShapeStrokeMiterLimit(Number.NaN)).toBe(10);
    expect(normalizeShapeStrokeMiterLimit(3)).toBe(3);
  });
});

describe('normalizeShapeStrokeWidth', () => {
  it('preserves zero as stroke-off and uses Canvas default 1 for other invalid values', () => {
    expect(normalizeShapeStrokeWidth(0)).toBe(0);
    expect(normalizeShapeStrokeWidth(-2)).toBe(1);
    expect(normalizeShapeStrokeWidth(Infinity)).toBe(1);
    expect(normalizeShapeStrokeWidth(Number.NaN)).toBe(1);
    expect(normalizeShapeStrokeWidth(3)).toBe(3);
  });
});

describe('setShapeBoundsGuard', () => {
  afterEach(() => setShapeBoundsGuard(null));

  it('exposes missing commands to a separately installed diagnostic policy', () => {
    const misses: string[] = [];
    setShapeBoundsGuard((_shape, _mode, key) => misses.push(key));

    computeShapeBoundsRectangle(createRectangle(), createShape({ data: { commands: ['__test.guard-callback__', 0] } }));

    expect(misses).toEqual(['__test.guard-callback__']);
  });
});
