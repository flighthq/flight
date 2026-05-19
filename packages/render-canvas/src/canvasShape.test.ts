import {
  beginBitmapFill,
  beginFill,
  createGraphics,
  drawCircle,
  drawEllipse,
  drawPath,
  drawRect,
  drawRoundRect,
  endFill,
  GraphicsPathCommand,
  lineStyle,
  lineTo,
  moveTo,
} from '@flighthq/shape';

import { renderGraphicsToCanvas } from './canvasShape';

function makeContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  // jsdom does not implement roundRect — stub it so tests can spy on it
  if (typeof ctx.roundRect !== 'function') {
    ctx.roundRect = vi.fn();
  }
  return ctx;
}

describe('two-pass rendering order', () => {
  it('draws fill before stroke so strokes render on top', () => {
    const ctx = makeContext();
    const order: string[] = [];
    vi.spyOn(ctx, 'fill').mockImplementation(() => {
      order.push('fill');
    });
    vi.spyOn(ctx, 'stroke').mockImplementation(() => {
      order.push('stroke');
    });
    const g = createGraphics();
    lineStyle(g, 2, 0x000000);
    beginFill(g, 0xff0000);
    drawRect(g, 0, 0, 100, 50);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(order).toEqual(['fill', 'stroke']);
  });
});

describe('renderGraphicsToCanvas', () => {
  it('does nothing when the graphics command list is empty', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    renderGraphicsToCanvas(ctx, createGraphics());
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls fill after beginFill + drawRect + endFill', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const g = createGraphics();
    beginFill(g, 0xff0000);
    drawRect(g, 0, 0, 100, 50);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls stroke once when lineStyle is set', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'stroke');
    const g = createGraphics();
    lineStyle(g, 2, 0x000000);
    drawRect(g, 0, 0, 100, 50);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls fill with evenodd winding rule by default', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const g = createGraphics();
    beginFill(g, 0xff0000, 1);
    drawRect(g, 0, 0, 10, 10);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(spy).toHaveBeenCalledWith('evenodd');
  });

  it('draws a circle using arc', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'arc');
    const g = createGraphics();
    beginFill(g, 0xffffff);
    drawCircle(g, 50, 50, 25);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(spy).toHaveBeenCalledWith(50, 50, 25, 0, Math.PI * 2, true);
  });

  it('draws an ellipse using ellipse', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'ellipse');
    const g = createGraphics();
    beginFill(g, 0xffffff);
    drawEllipse(g, 0, 0, 100, 50);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(spy).toHaveBeenCalledWith(50, 25, 50, 25, 0, 0, Math.PI * 2);
  });

  it('draws a rounded rect using roundRect', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'roundRect');
    const g = createGraphics();
    beginFill(g, 0xffffff);
    drawRoundRect(g, 0, 0, 100, 50, 10, 10);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(spy).toHaveBeenCalledWith(0, 0, 100, 50, 5);
  });
});

describe('lineStyle rendering', () => {
  it('sets lineCap to butt when caps is none', () => {
    const ctx = makeContext();
    const g = createGraphics();
    lineStyle(g, 2, 0x000000, 1, false, 'normal', 'none', 'round', 3);
    moveTo(g, 0, 0);
    lineTo(g, 100, 0);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(ctx.lineCap).toBe('butt');
  });

  it('sets lineCap to round when caps is round', () => {
    const ctx = makeContext();
    const g = createGraphics();
    lineStyle(g, 2, 0x000000, 1, false, 'normal', 'round', 'round', 3);
    moveTo(g, 0, 0);
    lineTo(g, 100, 0);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(ctx.lineCap).toBe('round');
  });

  it('sets lineJoin', () => {
    const ctx = makeContext();
    const g = createGraphics();
    lineStyle(g, 2, 0x000000, 1, false, 'normal', 'none', 'bevel', 3);
    moveTo(g, 0, 0);
    lineTo(g, 100, 0);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(ctx.lineJoin).toBe('bevel');
  });

  it('sets miterLimit', () => {
    const ctx = makeContext();
    const g = createGraphics();
    lineStyle(g, 2, 0x000000, 1, false, 'normal', 'none', 'miter', 8);
    moveTo(g, 0, 0);
    lineTo(g, 100, 0);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(ctx.miterLimit).toBe(8);
  });
});

describe('drawPath rendering', () => {
  it('executes MOVE_TO and LINE_TO path commands', () => {
    const ctx = makeContext();
    const moveSpy = vi.spyOn(ctx, 'moveTo');
    const lineSpy = vi.spyOn(ctx, 'lineTo');
    const g = createGraphics();
    beginFill(g, 0xff0000);
    drawPath(
      g,
      [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO, GraphicsPathCommand.LINE_TO],
      [10, 20, 100, 20, 100, 80],
    );
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(moveSpy).toHaveBeenCalledWith(10, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 20);
    expect(lineSpy).toHaveBeenCalledWith(100, 80);
  });

  it('uses nonzero winding rule when drawPath winding is nonZero', () => {
    const ctx = makeContext();
    const fillSpy = vi.spyOn(ctx, 'fill');
    const g = createGraphics();
    beginFill(g, 0xff0000);
    drawPath(g, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO], [0, 0, 100, 100], 'nonZero');
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(fillSpy).toHaveBeenCalledWith('nonzero');
  });

  it('uses evenodd winding rule when drawPath winding is evenOdd', () => {
    const ctx = makeContext();
    const fillSpy = vi.spyOn(ctx, 'fill');
    const g = createGraphics();
    beginFill(g, 0xff0000);
    drawPath(g, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.LINE_TO], [0, 0, 100, 100], 'evenOdd');
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(fillSpy).toHaveBeenCalledWith('evenodd');
  });

  it('executes CURVE_TO as quadraticCurveTo', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'quadraticCurveTo');
    const g = createGraphics();
    beginFill(g, 0xff0000);
    drawPath(g, [GraphicsPathCommand.MOVE_TO, GraphicsPathCommand.CURVE_TO], [0, 0, 50, 0, 100, 50]);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);
    expect(spy).toHaveBeenCalledWith(50, 0, 100, 50);
  });
});

describe('beginBitmapFill rendering', () => {
  function makeBitmapSource(w: number, h: number) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return { src: canvas, width: w, height: h } as never;
  }

  it('uses drawImage when drawRect fits within bitmap bounds', () => {
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    const drawImageSpy = vi.spyOn(ctx, 'drawImage');
    const fillSpy = vi.spyOn(ctx, 'fill');

    const g = createGraphics();
    beginBitmapFill(g, makeBitmapSource(200, 200));
    drawRect(g, 0, 0, 100, 100);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);

    // Optimization: drawImage is used directly; ctx.fill() (pattern fill) is NOT called.
    expect(drawImageSpy).toHaveBeenCalledOnce();
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('falls back to pattern fill when drawRect exceeds bitmap bounds', () => {
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    const drawImageSpy = vi.spyOn(ctx, 'drawImage');
    const fillSpy = vi.spyOn(ctx, 'fill');

    const g = createGraphics();
    beginBitmapFill(g, makeBitmapSource(50, 50));
    drawRect(g, 0, 0, 100, 100);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);

    expect(drawImageSpy).not.toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalled();
  });

  it('sets imageSmoothingEnabled when smooth is true', () => {
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;

    const g = createGraphics();
    beginBitmapFill(g, makeBitmapSource(200, 200), null, true, true);
    drawRect(g, 0, 0, 100, 100);
    endFill(g);
    renderGraphicsToCanvas(ctx, g);

    expect(ctx.imageSmoothingEnabled).toBe(true);
  });
});
