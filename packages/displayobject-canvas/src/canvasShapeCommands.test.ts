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
  PathCommand,
} from '@flighthq/shape';

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
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (typeof context.roundRect !== 'function') {
    context.roundRect = vi.fn();
  }
  return context;
}

function makeBitmapSource(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { source: canvas, width: w, height: h } as never;
}

describe('defaultCanvasBeginBitmapFill', () => {
  it('uses drawImage when drawRectangle fits within bitmap bounds', () => {
    const context = makeContext();
    const drawImageSpy = vi.spyOn(context, 'drawImage');
    const fillSpy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, makeBitmapSource(200, 200));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(drawImageSpy).toHaveBeenCalledOnce();
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('falls back to pattern fill when drawRectangle exceeds bitmap bounds', () => {
    const context = makeContext();
    const drawImageSpy = vi.spyOn(context, 'drawImage');
    const fillSpy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, makeBitmapSource(50, 50));
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(drawImageSpy).not.toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalled();
  });

  it('sets imageSmoothingEnabled when smooth is true', () => {
    const context = makeContext();
    context.imageSmoothingEnabled = false;
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, makeBitmapSource(200, 200), null, true, true);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(context.imageSmoothingEnabled).toBe(true);
  });
});

describe('defaultCanvasBeginFill', () => {
  it('calls fill when alpha is above threshold', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('does not call fill when alpha is below threshold', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 0);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('defaultCanvasBeginGradientFill', () => {
  it('calls createLinearGradient for linear type', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createLinearGradient');
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls createRadialGradient for radial type', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createRadialGradient');
    const shape = createShape();
    appendShapeBeginGradientFill(shape, 'radial', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasCubicCurveTo', () => {
  it('calls bezierCurveTo with correct control and anchor points', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'bezierCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCubicCurveTo(shape, 25, -50, 75, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(25, -50, 75, -50, 100, 0);
  });

  it('moves to origin when there is no current point', () => {
    const context = makeContext();
    const moveSpy = vi.spyOn(context, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeCubicCurveTo(shape, 25, -50, 75, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasCurveTo', () => {
  it('calls quadraticCurveTo with correct control and anchor points', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'quadraticCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeCurveTo(shape, 50, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, -50, 100, 0);
  });

  it('moves to origin when there is no current point', () => {
    const context = makeContext();
    const moveSpy = vi.spyOn(context, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeCurveTo(shape, 50, -50, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasDrawCircle', () => {
  it('draws using arc', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'arc');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffff);
    appendShapeCircle(shape, 50, 50, 25);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, 50, 25, 0, Math.PI * 2, true);
  });
});

describe('defaultCanvasDrawEllipse', () => {
  it('draws using ellipse', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'ellipse');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffff);
    appendShapeEllipse(shape, 0, 0, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, 25, 50, 25, 0, 0, Math.PI * 2);
  });
});

describe('defaultCanvasDrawPath', () => {
  it('executes MOVE_TO and LINE_TO path commands', () => {
    const context = makeContext();
    const moveSpy = vi.spyOn(context, 'moveTo');
    const lineSpy = vi.spyOn(context, 'lineTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO], [10, 20, 100, 20, 100, 80]);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(10, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 80);
  });

  it('executes CURVE_TO as quadraticCurveTo', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'quadraticCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.CURVE_TO], [0, 0, 50, 0, 100, 50]);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(50, 0, 100, 50);
  });

  it('executes CUBIC_CURVE_TO as bezierCurveTo', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'bezierCurveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO], [0, 0, 25, -50, 75, -50, 100, 0]);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(25, -50, 75, -50, 100, 0);
  });

  it('uses nonzero winding rule when drawPath winding is nonZero', () => {
    const context = makeContext();
    const fillSpy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.LINE_TO], [0, 0, 100, 100], 'nonZero');
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(fillSpy).toHaveBeenCalledWith('nonzero');
  });

  it('uses evenodd winding rule when drawPath winding is evenOdd', () => {
    const context = makeContext();
    const fillSpy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapePath(shape, [PathCommand.MOVE_TO, PathCommand.LINE_TO], [0, 0, 100, 100], 'evenOdd');
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(fillSpy).toHaveBeenCalledWith('evenodd');
  });
});

describe('defaultCanvasDrawRectangle', () => {
  it('calls context.rect for a plain fill', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'rect');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 10, 20, 50, 30);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(10, 20, 50, 30);
  });
});

describe('defaultCanvasDrawRoundRectangle', () => {
  it('calls roundRect with the minimum of rx and ry', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'roundRect');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xffffff);
    appendShapeRoundRectangle(shape, 0, 0, 100, 50, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(0, 0, 100, 50, 5);
  });
});

describe('defaultCanvasEndFill', () => {
  it('flushes a pending fill path', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineBitmapStyle', () => {
  it('applies a bitmap stroke pattern', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'stroke');
    const shape = createShape();
    appendShapeLineBitmapStyle(shape, makeBitmapSource(64, 64));
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineGradientStyle', () => {
  it('applies a gradient stroke', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'stroke');
    const shape = createShape();
    appendShapeLineGradientStyle(shape, 'linear', [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasLineStyle', () => {
  it('sets lineCap to butt when caps is none', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'round', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(context.lineCap).toBe('butt');
  });

  it('sets lineCap to round when caps is round', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'round', 'round', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(context.lineCap).toBe('round');
  });

  it('sets lineJoin', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'bevel', 3);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(context.lineJoin).toBe('bevel');
  });

  it('sets miterLimit', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000, 1, false, 'normal', 'none', 'miter', 8);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 0);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(context.miterLimit).toBe(8);
  });
});

describe('defaultCanvasLineTo', () => {
  it('calls context.lineTo', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'lineTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeMoveTo(shape, 0, 0);
    appendShapeLineTo(shape, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith(100, 50);
  });

  it('moves to origin when there is no current point', () => {
    const context = makeContext();
    const moveSpy = vi.spyOn(context, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeLineTo(shape, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(moveSpy).toHaveBeenCalledWith(0, 0);
  });
});

describe('defaultCanvasMoveTo', () => {
  it('calls context.moveTo', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'moveTo');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeMoveTo(shape, 30, 40);
    appendShapeLineTo(shape, 100, 40);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
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
