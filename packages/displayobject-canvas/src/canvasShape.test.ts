import { createMatrix } from '@flighthq/geometry';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import {
  appendShapeBeginBitmapFill,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  createShape,
} from '@flighthq/shape';
import { ShapeKind } from '@flighthq/types';

import { createCanvasRenderState } from './canvasRenderState';
import { defaultCanvasShapeRenderer, drawCanvasShape, renderCanvasShapeCommands } from './canvasShape';
import { defaultCanvasShapeCommands } from './canvasShapeCommands';
import { registerCanvasShapeCommands } from './canvasShapeRegistry';

beforeAll(() => {
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
});

function makeContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return canvas.getContext('2d') as CanvasRenderingContext2D;
}

describe('drawCanvasShape', () => {
  it('does not throw for a shape with no commands', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const state = createCanvasRenderState(canvas);
    registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
    const shape = createShape();
    const data = getOrCreateRenderProxy2D(state, shape);
    expect(() => drawCanvasShape(state, data)).not.toThrow();
  });

  it('calls fill when shape has beginFill and drawRectangle commands', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const state = createCanvasRenderState(canvas);
    registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 50, 50);
    appendShapeEndFill(shape);
    const data = getOrCreateRenderProxy2D(state, shape);
    const spy = vi.spyOn(state.context, 'fill');
    drawCanvasShape(state, data);
    expect(spy).toHaveBeenCalled();
  });
});

describe('renderCanvasShapeCommands', () => {
  it('does nothing when the command list is empty', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'fill');
    renderCanvasShapeCommands(context, createShape().data.commands);
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls fill after beginFill + drawRectangle + endFill', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls stroke once when lineStyle is set', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'stroke');
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000);
    appendShapeRectangle(shape, 0, 0, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('draws fill before stroke so strokes render on top', () => {
    const context = makeContext();
    const order: string[] = [];
    vi.spyOn(context, 'fill').mockImplementation(() => {
      order.push('fill');
    });
    vi.spyOn(context, 'stroke').mockImplementation(() => {
      order.push('stroke');
    });
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000);
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(order).toEqual(['fill', 'stroke']);
  });

  it('calls fill with evenodd winding rule by default', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands);
    expect(spy).toHaveBeenCalledWith('evenodd');
  });

  it('does not throw on a zero-size rectangle', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, 10, 10, 0, 0);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands)).not.toThrow();
  });

  it('does not throw on NaN coordinates', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeMoveTo(shape, Number.NaN, Number.NaN);
    appendShapeLineTo(shape, Number.NaN, 10);
    appendShapeRectangle(shape, Number.NaN, 0, Number.NaN, 10);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands)).not.toThrow();
  });

  it('does not throw on Infinity coordinates', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeMoveTo(shape, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
    appendShapeLineTo(shape, Number.POSITIVE_INFINITY, 0);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands)).not.toThrow();
  });

  it('does not throw on very large coordinates', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, -1e20, -1e20, 2e20, 2e20);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands)).not.toThrow();
  });

  it('does not throw on a singular bitmap-fill matrix', () => {
    const context = makeContext();
    const bitmapSource = document.createElement('canvas');
    bitmapSource.width = 50;
    bitmapSource.height = 50;
    const bitmap = { source: bitmapSource, width: 50, height: 50 } as never;
    const singular = createMatrix(0, 0, 0, 0, 0, 0);
    const shape = createShape();
    appendShapeBeginBitmapFill(shape, bitmap, singular);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands)).not.toThrow();
  });

  it('skips an unknown command key without throwing', () => {
    const context = makeContext();
    const fillSpy = vi.spyOn(context, 'fill');
    // Raw buffer: [key, argCount, ...args]. The unknown key has no registered
    // handler, so getCanvasShapeCommand returns the undefined sentinel and the
    // walk advances past it rather than throwing.
    const commands: unknown[] = ['acme.unknownCommand', 2, 1, 2];
    expect(() => renderCanvasShapeCommands(context, commands)).not.toThrow();
    expect(fillSpy).not.toHaveBeenCalled();
  });
});
