import { createMatrix } from '@flighthq/geometry/contract';
import { createImageResource } from '@flighthq/image/contract';
import { createRenderState } from '@flighthq/render/contract';
import {
  appendShapeBeginTextureFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineTextureStyle,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  createShape,
  PathCommand,
} from '@flighthq/shape/contract';
import { createSampler, createTexture } from '@flighthq/texture/contract';
import type { RenderState } from '@flighthq/types/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { renderCanvasShapeCommands } from './canvasShape';
import { defaultCanvasShapeCommands, defaultCanvasTextureShapeCommands } from './canvasShapeCommands';
import { registerCanvasShapeCommands } from './canvasShapeRegistry';
import { createCanvasTextureResolvers } from './canvasTextureResolver';

// Commands are registered per render state, so each target carries its own set — there is no global
// to fall back on, and a bare state replays nothing.
function makeShapeTarget(): { context: CanvasRenderingContext2D; state: RenderState } {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  const state = createRenderState();
  registerCanvasShapeCommands(state, [...defaultCanvasShapeCommands, ...defaultCanvasTextureShapeCommands]);
  return { context, state };
}

function makeBitmapTexture(w: number, h: number, smooth = true, repeat = false) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return createTexture({
    sampler: createSampler({
      magFilter: smooth ? 'linear' : 'nearest',
      minFilter: smooth ? 'linear' : 'nearest',
      mipmaps: false,
      wrapU: repeat ? 'repeat' : 'clamp-to-edge',
      wrapV: repeat ? 'repeat' : 'clamp-to-edge',
    }),
    dimension: '2d',
    source: createImageResource(canvas),
  });
}

const resolvers = createCanvasTextureResolvers();
registerCanvasBitmapTextureResolver(resolvers);
registerCanvasImageTextureResolver(resolvers);

describe('defaultCanvasBeginFill', () => {
  it('calls fill when alpha is above threshold', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 1);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not call fill when alpha is below threshold', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 0);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('defaultCanvasBeginGradientFill', () => {
  it('calls createLinearGradient for linear type', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'createLinearGradient');
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'linear', [0xff0000ff, 0x0000ffff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls createRadialGradient for radial type', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'createRadialGradient');
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'radial', [0xff0000ff, 0x0000ffff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasBeginTextureFill', () => {
  it('uses drawImage when drawRectangle fits within bitmap bounds', () => {
    const { context, state } = makeShapeTarget();
    const drawImageSpy = vi.spyOn(context, 'drawImage');
    const fillSpy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginTextureFill(shape, makeBitmapTexture(200, 200));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(drawImageSpy).toHaveBeenCalledOnce();
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('falls back to pattern fill when drawRectangle exceeds bitmap bounds', () => {
    const { context, state } = makeShapeTarget();
    const drawImageSpy = vi.spyOn(context, 'drawImage');
    const fillSpy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginTextureFill(shape, makeBitmapTexture(50, 50));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(drawImageSpy).not.toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalled();
  });

  // A singular fill matrix must take the SAME path as no matrix. `inverseMatrix` answers a singular
  // input with a defined-but-wrong matrix (a/b/c/d zeroed, tx/ty negated) rather than NaN, so an
  // unchecked return does not merely mis-place the fill — flushCanvasShapePath wraps the fill in
  // `context.transform(...)` / `context.transform(inverse...)`, and a ZEROED inverse never undoes the
  // first, leaving the canvas transform collapsed for everything drawn afterwards.
  it('drops a singular fill matrix to the untransformed path instead of a defined-but-wrong inverse', () => {
    const { context, state } = makeShapeTarget();
    const transformSpy = vi.spyOn(context, 'transform');
    const shape = createShape();
    appendShapeBeginTextureFill(shape, makeBitmapTexture(50, 50), createMatrix(0, 0, 0, 0, 0, 0));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(transformSpy).not.toHaveBeenCalled();
  });

  it('still applies an invertible fill matrix and undoes it afterwards', () => {
    const { context, state } = makeShapeTarget();
    const transformSpy = vi.spyOn(context, 'transform');
    const shape = createShape();
    appendShapeBeginTextureFill(shape, makeBitmapTexture(50, 50), createMatrix(1, 0, 0, 1, 10, 5));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(transformSpy).toHaveBeenCalledTimes(2);
    // The second call must UNDO the first, which is the property a zeroed inverse silently breaks.
    expect(transformSpy.mock.calls[0][4]).toBeCloseTo(10, 6);
    expect(transformSpy.mock.calls[1][4]).toBeCloseTo(-10, 6);
  });

  it('sets imageSmoothingEnabled from the texture sampler', () => {
    const { context, state } = makeShapeTarget();
    context.imageSmoothingEnabled = false;
    const shape = createShape();
    appendShapeBeginTextureFill(shape, makeBitmapTexture(200, 200, true));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(context.imageSmoothingEnabled).toBe(true);
  });
});

describe('defaultCanvasCubicCurveTo', () => {
  it('calls bezierCurveTo with correct control and anchor points', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'bezierCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCubicCurveTo(shape, 25, -50, 75, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(25, -50, 75, -50, 100, 0);
  });

  it('moves to origin when there is no current point', () => {
    const { context, state } = makeShapeTarget();
    const moveSpy = vi.spyOn(context, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeCubicCurveTo(shape, 25, -50, 75, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasCurveTo', () => {
  it('calls quadraticCurveTo with correct control and anchor points', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'quadraticCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCurveTo(shape, 50, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(50, -50, 100, 0);
  });

  it('moves to origin when there is no current point', () => {
    const { context, state } = makeShapeTarget();
    const moveSpy = vi.spyOn(context, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeCurveTo(shape, 50, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasDrawCircle', () => {
  it('draws using arc', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'arc');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffffff);
    appendShapeCircle(shape, 50, 50, 25);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(50, 50, 25, 0, Math.PI * 2, true);
  });
});

describe('defaultCanvasDrawEllipse', () => {
  it('draws using ellipse', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'ellipse');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffffff);
    appendShapeEllipse(shape, 0, 0, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(50, 25, 50, 25, 0, 0, Math.PI * 2);
  });
});

describe('defaultCanvasDrawPath', () => {
  it('executes MOVE_TO and LINE_TO path commands', () => {
    const { context, state } = makeShapeTarget();
    const moveSpy = vi.spyOn(context, 'moveTo');
    const lineSpy = vi.spyOn(context, 'lineTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO], [10, 20, 100, 20, 100, 80]);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(moveSpy).toHaveBeenCalledWith(10, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 80);
  });

  it('executes CURVE_TO as quadraticCurveTo', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'quadraticCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.CURVE_TO], [0, 0, 50, 0, 100, 50]);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(50, 0, 100, 50);
  });

  it('executes CUBIC_CURVE_TO as bezierCurveTo', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'bezierCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO], [0, 0, 25, -50, 75, -50, 100, 0]);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(25, -50, 75, -50, 100, 0);
  });

  // A CLOSE verb must reach the context, or the subpath is stroked as though it were open and its closing
  // segment is never drawn — a stroked rect rendered three of its four sides, on canvas, webgl and webgpu
  // alike, because both GPU backends rasterize closed strokes through this replay.
  //
  // Asserted as a spy on closePath rather than through pixels, so the omission fails here rather than in a
  // render baseline. The negative case is included because the bug was a MISSING SWITCH CASE: a test that
  // only checked the closed path would pass against an implementation that closed everything.
  it('closes a subpath when the path carries a CLOSE verb, and only then', () => {
    const closed = makeShapeTarget();
    const closeSpy = vi.spyOn(closed.context, 'closePath');
    const closedShape = createShape();
    appendShapeBeginFill(closedShape, 0xff0000ff);
    appendShapePath(
      closedShape,
      [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE],
      [0, 0, 100, 0, 100, 100],
      'nonZero',
    );
    appendShapeEndFill(closedShape);
    renderCanvasShapeCommands(closed.context, closed.state, closedShape.data.commands, resolvers);
    expect(closeSpy).toHaveBeenCalledTimes(1);

    const open = makeShapeTarget();
    const openSpy = vi.spyOn(open.context, 'closePath');
    const openShape = createShape();
    appendShapeBeginFill(openShape, 0xff0000ff);
    appendShapePath(openShape, [PathCommand.MOVE_TO, PathCommand.LINE_TO], [0, 0, 100, 100], 'nonZero');
    appendShapeEndFill(openShape);
    renderCanvasShapeCommands(open.context, open.state, openShape.data.commands, resolvers);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('uses nonzero winding rule when drawPath winding is nonZero', () => {
    const { context, state } = makeShapeTarget();
    const fillSpy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.LINE_TO], [0, 0, 100, 100], 'nonZero');
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(fillSpy).toHaveBeenCalledWith('nonzero');
  });

  it('uses evenodd winding rule when drawPath winding is evenOdd', () => {
    const { context, state } = makeShapeTarget();
    const fillSpy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.LINE_TO], [0, 0, 100, 100], 'evenOdd');
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(fillSpy).toHaveBeenCalledWith('evenodd');
  });
});

describe('defaultCanvasDrawRectangle', () => {
  it('calls context.rect for a plain fill', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'rect');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 10, 20, 50, 30);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(10, 20, 50, 30);
  });
});

describe('defaultCanvasDrawRoundRectangle', () => {
  it('calls roundRect with the minimum of rx and ry', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'roundRect');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffffff);
    appendShapeRoundRectangle(shape, 0, 0, 100, 50, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(0, 0, 100, 50, 5);
  });

  it('keeps the corner radius nonnegative when rectangle dimensions are negative', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'roundRect');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffffff);
    appendShapeRoundRectangle(shape, 0, 0, -100, -50, 200, 200);
    appendShapeEndFill(shape);

    expect(() => renderCanvasShapeCommands(context, state, shape.data.commands, resolvers)).not.toThrow();
    expect(spy).toHaveBeenCalledWith(0, 0, -100, -50, 25);
  });

  it('uses a fake roundRect that rejects a negative radius like the browser', () => {
    const { context } = makeShapeTarget();

    expect(() => context.roundRect(0, 0, 100, 50, -1)).toThrowError(RangeError);
  });
});

describe('defaultCanvasEndFill', () => {
  it('flushes a pending fill path', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineGradientStyle', () => {
  it('applies a gradient stroke', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'stroke');
    const shape = createShape();
    appendShapeLineGradientStyle(shape, 'linear', [0xff0000ff, 0x0000ffff], [1, 1], [0, 255]);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineStyle', () => {
  it('normalizes invalid retained Canvas style values to deterministic defaults', () => {
    const { context, state } = makeShapeTarget();
    context.lineWidth = 37;
    context.miterLimit = 23;
    const shape = createShape();
    appendShapeLineStyle(shape, -2, 0x000000ff, 1, false, 'normal', 'none', 'miter', Number.NaN);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);

    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);

    expect(context.lineWidth).toBe(1);
    expect(context.miterLimit).toBe(10);
  });

  it('sets lineCap to butt when caps is none', () => {
    const { context, state } = makeShapeTarget();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000ff, 1, false, 'normal', 'none', 'round', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(context.lineCap).toBe('butt');
  });

  it('sets lineCap to round when caps is round', () => {
    const { context, state } = makeShapeTarget();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000ff, 1, false, 'normal', 'round', 'round', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(context.lineCap).toBe('round');
  });

  it('sets lineJoin', () => {
    const { context, state } = makeShapeTarget();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000ff, 1, false, 'normal', 'none', 'bevel', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(context.lineJoin).toBe('bevel');
  });

  it('sets miterLimit', () => {
    const { context, state } = makeShapeTarget();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000ff, 1, false, 'normal', 'none', 'miter', 8);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(context.miterLimit).toBe(8);
  });
});

describe('defaultCanvasLineTextureStyle', () => {
  it('applies a bitmap stroke pattern', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'stroke');
    const shape = createShape();
    appendShapeLineTextureStyle(shape, makeBitmapTexture(64, 64));
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineTo', () => {
  it('calls context.lineTo', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'lineTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(100, 50);
  });

  it('moves to origin when there is no current point', () => {
    const { context, state } = makeShapeTarget();
    const moveSpy = vi.spyOn(context, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeLineTo(shape, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasMoveTo', () => {
  it('calls context.moveTo', () => {
    const { context, state } = makeShapeTarget();
    const spy = vi.spyOn(context, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff);
    appendShapeMoveTo(shape, 30, 40);
    appendShapeLineTo(shape, 100, 40);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, state, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith(30, 40);
  });
});

describe('defaultCanvasShapeCommands', () => {
  it('contains the texture-free standard shape command keys', () => {
    const keys = [
      'beginFill',
      'beginGradientFill',
      'cubicCurveTo',
      'curveTo',
      'drawCircle',
      'drawEllipse',
      'drawPath',
      'drawRectangle',
      'drawRoundRectangle',
      'endFill',
      'lineGradientStyle',
      'lineTo',
      'lineStyle',
      'moveTo',
    ];
    const registeredKeys = defaultCanvasShapeCommands.map((c) => c.key);
    for (const key of keys) {
      expect(registeredKeys).toContain(key);
    }
  });
});

describe('defaultCanvasTextureShapeCommands', () => {
  it('contains the opt-in bitmap fill and stroke handlers', () => {
    expect(defaultCanvasTextureShapeCommands.map((command) => command.key)).toEqual([
      'beginTextureFill',
      'lineTextureStyle',
    ]);
  });
});
