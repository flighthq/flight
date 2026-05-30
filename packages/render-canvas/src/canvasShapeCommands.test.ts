import {
  beginShapeBitmapFill,
  beginShapeFill,
  beginShapeGradientFill,
  createShape,
  cubicCurveToShape,
  curveToShape,
  drawShapeCircle,
  drawShapeEllipse,
  drawShapePath,
  drawShapeRectangle,
  drawShapeRoundRectangle,
  endShapeFill,
  GraphicsPathCommand,
  lineToShape,
  moveToShape,
  setShapeLineBitmapStyle,
  setShapeLineGradientStyle,
  setShapeLineStyle,
} from '@flighthq/scenegraph-display';

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
    beginShapeBitmapFill(shape, makeBitmapSource(200, 200));
    drawShapeRectangle(shape, 0, 0, 100, 100);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(drawImageSpy).toHaveBeenCalledOnce();
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('falls back to pattern fill when drawRectangle exceeds bitmap bounds', () => {
    const ctx = makeContext();
    const drawImageSpy = vi.spyOn(ctx, 'drawImage');
    const fillSpy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    beginShapeBitmapFill(shape, makeBitmapSource(50, 50));
    drawShapeRectangle(shape, 0, 0, 100, 100);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(drawImageSpy).not.toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalled();
  });

  it('sets imageSmoothingEnabled when smooth is true', () => {
    const ctx = makeContext();
    ctx.imageSmoothingEnabled = false;
    const shape = createShape();
    beginShapeBitmapFill(shape, makeBitmapSource(200, 200), null, true, true);
    drawShapeRectangle(shape, 0, 0, 100, 100);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.imageSmoothingEnabled).toBe(true);
  });
});

describe('defaultCanvasBeginFill', () => {
  it('calls fill when alpha is above threshold', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000, 1);
    drawShapeRectangle(shape, 0, 0, 10, 10);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not call fill when alpha is below threshold', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000, 0);
    drawShapeRectangle(shape, 0, 0, 10, 10);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('defaultCanvasBeginGradientFill', () => {
  it('calls createLinearGradient for linear type', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'createLinearGradient');
    const shape = createShape();
    beginShapeGradientFill(shape, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    drawShapeRectangle(shape, 0, 0, 100, 100);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls createRadialGradient for radial type', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'createRadialGradient');
    const shape = createShape();
    beginShapeGradientFill(shape, 'radial', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    drawShapeRectangle(shape, 0, 0, 100, 100);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasCubicCurveTo', () => {
  it('calls bezierCurveTo with correct control and anchor points', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'bezierCurveTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    moveToShape(shape, 0, 0);
    cubicCurveToShape(shape, 25, -50, 75, -50, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(25, -50, 75, -50, 100, 0);
  });

  it('moves to origin when there is no current point', () => {
    const ctx = makeContext();
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    cubicCurveToShape(shape, 25, -50, 75, -50, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasCurveTo', () => {
  it('calls quadraticCurveTo with correct control and anchor points', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'quadraticCurveTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    moveToShape(shape, 0, 0);
    curveToShape(shape, 50, -50, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, -50, 100, 0);
  });

  it('moves to origin when there is no current point', () => {
    const ctx = makeContext();
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    curveToShape(shape, 50, -50, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasDrawCircle', () => {
  it('draws using arc', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'arc');
    const shape = createShape();
    beginShapeFill(shape, 0xffffff);
    drawShapeCircle(shape, 50, 50, 25);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, 50, 25, 0, Math.PI * 2, true);
  });
});

describe('defaultCanvasDrawEllipse', () => {
  it('draws using ellipse', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'ellipse');
    const shape = createShape();
    beginShapeFill(shape, 0xffffff);
    drawShapeEllipse(shape, 0, 0, 100, 50);
    endShapeFill(shape);
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
    beginShapeFill(shape, 0xff0000);
    drawShapePath(
      shape,
      [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO, GraphicsPathCommand.LINE_TO],
      [10, 20, 100, 20, 100, 80],
    );
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(10, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 80);
  });

  it('executes CURVE_TO as quadraticCurveTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'quadraticCurveTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapePath(shape, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.CURVE_TO], [0, 0, 50, 0, 100, 50]);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, 0, 100, 50);
  });

  it('executes CUBIC_CURVE_TO as bezierCurveTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'bezierCurveTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapePath(
      shape,
      [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.CUBIC_CURVE_TO],
      [0, 0, 25, -50, 75, -50, 100, 0],
    );
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(25, -50, 75, -50, 100, 0);
  });

  it('uses nonzero winding rule when drawPath winding is nonZero', () => {
    const ctx = makeContext();
    const fillSpy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapePath(shape, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO], [0, 0, 100, 100], 'nonZero');
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(fillSpy).toHaveBeenCalledWith('nonzero');
  });

  it('uses evenodd winding rule when drawPath winding is evenOdd', () => {
    const ctx = makeContext();
    const fillSpy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapePath(shape, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO], [0, 0, 100, 100], 'evenOdd');
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(fillSpy).toHaveBeenCalledWith('evenodd');
  });
});

describe('defaultCanvasDrawRectangle', () => {
  it('calls ctx.rect for a plain fill', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'rect');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapeRectangle(shape, 10, 20, 50, 30);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(10, 20, 50, 30);
  });
});

describe('defaultCanvasDrawRoundRectangle', () => {
  it('calls roundRect with the minimum of rx and ry', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'roundRect');
    const shape = createShape();
    beginShapeFill(shape, 0xffffff);
    drawShapeRoundRectangle(shape, 0, 0, 100, 50, 10, 10);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(0, 0, 100, 50, 5);
  });
});

describe('defaultCanvasEndFill', () => {
  it('flushes a pending fill path', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    drawShapeRectangle(shape, 0, 0, 10, 10);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineBitmapStyle', () => {
  it('applies a bitmap stroke pattern', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'stroke');
    const shape = createShape();
    setShapeLineBitmapStyle(shape, makeBitmapSource(64, 64));
    moveToShape(shape, 0, 0);
    lineToShape(shape, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineGradientStyle', () => {
  it('applies a gradient stroke', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'stroke');
    const shape = createShape();
    setShapeLineGradientStyle(shape, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    moveToShape(shape, 0, 0);
    lineToShape(shape, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineStyle', () => {
  it('sets lineCap to butt when caps is none', () => {
    const ctx = makeContext();
    const shape = createShape();
    setShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'round', 3);
    moveToShape(shape, 0, 0);
    lineToShape(shape, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.lineCap).toBe('butt');
  });

  it('sets lineCap to round when caps is round', () => {
    const ctx = makeContext();
    const shape = createShape();
    setShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'round', 'round', 3);
    moveToShape(shape, 0, 0);
    lineToShape(shape, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.lineCap).toBe('round');
  });

  it('sets lineJoin', () => {
    const ctx = makeContext();
    const shape = createShape();
    setShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'bevel', 3);
    moveToShape(shape, 0, 0);
    lineToShape(shape, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.lineJoin).toBe('bevel');
  });

  it('sets miterLimit', () => {
    const ctx = makeContext();
    const shape = createShape();
    setShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'miter', 8);
    moveToShape(shape, 0, 0);
    lineToShape(shape, 100, 0);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(ctx.miterLimit).toBe(8);
  });
});

describe('defaultCanvasLineTo', () => {
  it('calls ctx.lineTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'lineTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    moveToShape(shape, 0, 0);
    lineToShape(shape, 100, 50);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(100, 50);
  });

  it('moves to origin when there is no current point', () => {
    const ctx = makeContext();
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    lineToShape(shape, 100, 50);
    endShapeFill(shape);
    renderCanvasShapeCommands(ctx, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasMoveTo', () => {
  it('calls ctx.moveTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'moveTo');
    const shape = createShape();
    beginShapeFill(shape, 0xff0000);
    moveToShape(shape, 30, 40);
    lineToShape(shape, 100, 40);
    endShapeFill(shape);
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
