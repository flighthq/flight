import { createGraphics } from '@flighthq/shape';
import { beginFill, drawCircle, drawEllipse, drawRect, drawRoundRect, endFill, lineStyle } from '@flighthq/shape';

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

  it('calls fill with evenodd winding rule', () => {
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
