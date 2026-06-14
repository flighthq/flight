import {
  appendShapeBeginBitmapFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineBitmapStyle,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  createShape,
  GraphicsPathCommand,
} from '@flighthq/displayobject';

import { renderCanvasShapeCommands } from './canvasShape';
import { defaultCanvasShapeCommands } from './canvasShapeCommands';
import { registerCanvasShapeCommands } from './canvasShapeRegistry';

beforeAll(() => {
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
});

function makeContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (typeof ctx.roundRect !== 'function') {
    ctx.roundRect = vi.fn();
  }
  return ctx;
}

function makeBitmapSource(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { src: canvas, width: w, height: h } as never;
}

describe('defaultCanvasBeginBitmapFill', () => {
  it('uses drawImage when drawRectangle fits within bitmap bounds', () => {
    const ctx = makeContext();
    const drawImageSpy = vi.spyOn(ctx, 'drawImage');
    const fillSpy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, makeBitmapSource(200, 200));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(drawImageSpy).toHaveBeenCalledOnce();
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('falls back to pattern fill when drawRectangle exceeds bitmap bounds', () => {
    const ctx = makeContext();
    const drawImageSpy = vi.spyOn(ctx, 'drawImage');
    const fillSpy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, makeBitmapSource(50, 50));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(drawImageSpy).not.toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalled();
  });

  it('sets imageSmoothingEnabled when smooth is true', () => {
    const ctx = makeContext();
    ctx.imageSmoothingEnabled = false;
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, makeBitmapSource(200, 200), null, true, true);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.imageSmoothingEnabled).toBe(true);
  });
});

describe('defaultCanvasBeginFill', () => {
  it('calls fill when alpha is above threshold', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not call fill when alpha is below threshold', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 0);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('defaultCanvasBeginGradientFill', () => {
  it('calls createLinearGradient for linear type', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'createLinearGradient');
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls createRadialGradient for radial type', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'createRadialGradient');
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'radial', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasCubicCurveTo', () => {
  it('calls bezierCurveTo with correct control and anchor points', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'bezierCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCubicCurveTo(shape, 25, -50, 75, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(25, -50, 75, -50, 100, 0);
  });

  it('moves to origin when there is no current point', () => {
    const ctx = makeContext();
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeCubicCurveTo(shape, 25, -50, 75, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasCurveTo', () => {
  it('calls quadraticCurveTo with correct control and anchor points', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'quadraticCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCurveTo(shape, 50, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, -50, 100, 0);
  });

  it('moves to origin when there is no current point', () => {
    const ctx = makeContext();
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeCurveTo(shape, 50, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasDrawCircle', () => {
  it('draws using arc', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'arc');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffff);
    appendShapeCircle(shape, 50, 50, 25);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, 50, 25, 0, Math.PI * 2, true);
  });
});

describe('defaultCanvasDrawEllipse', () => {
  it('draws using ellipse', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'ellipse');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffff);
    appendShapeEllipse(shape, 0, 0, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, 25, 50, 25, 0, 0, Math.PI * 2);
  });
});

describe('defaultCanvasDrawPath', () => {
  it('executes MOVE_TO and LINE_TO path commands', () => {
    const ctx = makeContext();
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const lineSpy = vi.spyOn(ctx, 'lineTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(
      shape,
      [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO, GraphicsPathCommand.LINE_TO],
      [10, 20, 100, 20, 100, 80],
    );
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(10, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 80);
  });

  it('executes CURVE_TO as quadraticCurveTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'quadraticCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(shape, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.CURVE_TO], [0, 0, 50, 0, 100, 50]);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, 0, 100, 50);
  });

  it('executes CUBIC_CURVE_TO as bezierCurveTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'bezierCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(
      shape,
      [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.CUBIC_CURVE_TO],
      [0, 0, 25, -50, 75, -50, 100, 0],
    );
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(25, -50, 75, -50, 100, 0);
  });

  it('uses nonzero winding rule when drawPath winding is nonZero', () => {
    const ctx = makeContext();
    const fillSpy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(shape, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO], [0, 0, 100, 100], 'nonZero');
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(fillSpy).toHaveBeenCalledWith('nonzero');
  });

  it('uses evenodd winding rule when drawPath winding is evenOdd', () => {
    const ctx = makeContext();
    const fillSpy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(shape, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO], [0, 0, 100, 100], 'evenOdd');
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(fillSpy).toHaveBeenCalledWith('evenodd');
  });
});

describe('defaultCanvasDrawRectangle', () => {
  it('calls ctx.rect for a plain fill', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'rect');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 10, 20, 50, 30);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(10, 20, 50, 30);
  });
});

describe('defaultCanvasDrawRoundRectangle', () => {
  it('calls roundRect with the minimum of rx and ry', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'roundRect');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffff);
    appendShapeRoundRectangle(shape, 0, 0, 100, 50, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(0, 0, 100, 50, 5);
  });
});

describe('defaultCanvasEndFill', () => {
  it('flushes a pending fill path', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineBitmapStyle', () => {
  it('applies a bitmap stroke pattern', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'stroke');
    const shape = createShape();
    appendShapeLineBitmapStyle(shape, makeBitmapSource(64, 64));
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineGradientStyle', () => {
  it('applies a gradient stroke', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'stroke');
    const shape = createShape();
    appendShapeLineGradientStyle(shape, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineStyle', () => {
  it('sets lineCap to butt when caps is none', () => {
    const ctx = makeContext();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'round', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.lineCap).toBe('butt');
  });

  it('sets lineCap to round when caps is round', () => {
    const ctx = makeContext();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'round', 'round', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.lineCap).toBe('round');
  });

  it('sets lineJoin', () => {
    const ctx = makeContext();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'bevel', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.lineJoin).toBe('bevel');
  });

  it('sets miterLimit', () => {
    const ctx = makeContext();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'miter', 8);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.miterLimit).toBe(8);
  });
});

describe('defaultCanvasLineTo', () => {
  it('calls ctx.lineTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'lineTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(100, 50);
  });

  it('moves to origin when there is no current point', () => {
    const ctx = makeContext();
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeLineTo(shape, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasMoveTo', () => {
  it('calls ctx.moveTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeMoveTo(shape, 30, 40);
    appendShapeLineTo(shape, 100, 40);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(30, 40);
  });
});

describe('defaultCanvasShapeCommands', () => {
  it('contains handlers for all standard shape command keys', () => {
    const keys = [
      'beginBitmapFill',
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
      'lineBitmapStyle',
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
