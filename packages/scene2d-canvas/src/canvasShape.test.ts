import { createMatrix } from '@flighthq/geometry/contract';
import { createImageResource } from '@flighthq/image/contract';
import { appendPathLineTo, appendPathMoveTo, createPath, createPathMorph } from '@flighthq/path/contract';
import {
  enableRenderRegistryGuards,
  explainRenderRegistryMisses,
  getOrCreateRenderProxy2D,
  prepareScene2DRender,
  registerRenderer,
} from '@flighthq/render/contract';
import {
  appendMorphShapePath,
  appendShapeBeginTextureFill,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  createMorphShape,
  createShape,
  setMorphShapeProgress,
} from '@flighthq/shape/contract';
import { createTexture } from '@flighthq/texture/contract';
import { MorphShapeKind, RenderRegistry, ShapeKind } from '@flighthq/types/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { createCanvasRenderState } from './canvasRenderState';
import {
  defaultCanvasMorphShapeRenderer,
  defaultCanvasShapeRenderer,
  drawCanvasShape,
  renderCanvasShapeCommands,
} from './canvasShape';
import { defaultCanvasShapeCommands, defaultCanvasTextureShapeCommands } from './canvasShapeCommands';
import { registerCanvasShapeCommands } from './canvasShapeRegistry';
import { createCanvasTextureResolvers } from './canvasTextureResolver';

beforeAll(() => {
  registerCanvasShapeCommands([...defaultCanvasShapeCommands, ...defaultCanvasTextureShapeCommands]);
});

function makeContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return canvas.getContext('2d') as CanvasRenderingContext2D;
}

const resolvers = createCanvasTextureResolvers();
registerCanvasBitmapTextureResolver(resolvers);
registerCanvasImageTextureResolver(resolvers);

describe('drawCanvasShape', () => {
  it('renders updated MorphShape geometry through stable retained path buffers', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    registerRenderer(state, MorphShapeKind, defaultCanvasMorphShapeRenderer);
    const start = createPath();
    appendPathMoveTo(start, 0, 0);
    appendPathLineTo(start, 10, 0);
    const end = createPath();
    appendPathMoveTo(end, 20, 30);
    appendPathLineTo(end, 40, 30);
    const shape = createMorphShape(createPathMorph(start, end)!);
    appendShapeBeginFill(shape, 0xff0000);
    appendMorphShapePath(shape);
    appendShapeEndFill(shape);
    const commands = shape.data.path.commands;
    const coordinates = shape.data.path.data;
    const moveTo = vi.spyOn(state.context, 'moveTo');
    const bezierCurveTo = vi.spyOn(state.context, 'bezierCurveTo');

    expect(prepareScene2DRender(state, shape)).toBe(true);
    const proxy = getOrCreateRenderProxy2D(state, shape);
    drawCanvasShape(state, proxy);
    expect(moveTo).toHaveBeenLastCalledWith(0, 0);
    expect(bezierCurveTo).toHaveBeenLastCalledWith(...shape.data.path.data.slice(2));

    setMorphShapeProgress(shape, 1);
    expect(prepareScene2DRender(state, shape)).toBe(true);
    drawCanvasShape(state, proxy);
    expect(shape.data.path.commands).toBe(commands);
    expect(shape.data.path.data).toBe(coordinates);
    expect(moveTo).toHaveBeenLastCalledWith(20, 30);
    expect(bezierCurveTo).toHaveBeenLastCalledWith(...shape.data.path.data.slice(2));
  });

  it('renders MorphShapeKind through the explicit default renderer alias', () => {
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    registerRenderer(state, MorphShapeKind, defaultCanvasMorphShapeRenderer);
    const shape = createMorphShape({ commands: [], endData: [], startData: [], winding: 'nonZero' });
    const data = getOrCreateRenderProxy2D(state, shape);

    expect(defaultCanvasMorphShapeRenderer).toBe(defaultCanvasShapeRenderer);
    expect(() => drawCanvasShape(state, data)).not.toThrow();
  });

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
    renderCanvasShapeCommands(context, createShape().data.commands, resolvers);
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls fill after beginFill + drawRectangle + endFill', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000);
    appendShapeRectangle(shape, 0, 0, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls stroke once when lineStyle is set', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'stroke');
    const shape = createShape();
    appendShapeLineStyle(shape, 2, 0x000000);
    appendShapeRectangle(shape, 0, 0, 100, 50);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands, resolvers);
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
    renderCanvasShapeCommands(context, shape.data.commands, resolvers);
    expect(order).toEqual(['fill', 'stroke']);
  });

  it('calls fill with evenodd winding rule by default', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'fill');
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, 0, 0, 10, 10);
    appendShapeEndFill(shape);
    renderCanvasShapeCommands(context, shape.data.commands, resolvers);
    expect(spy).toHaveBeenCalledWith('evenodd');
  });

  it('does not throw on a zero-size rectangle', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, 10, 10, 0, 0);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands, resolvers)).not.toThrow();
  });

  it('does not throw on NaN coordinates', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeMoveTo(shape, Number.NaN, Number.NaN);
    appendShapeLineTo(shape, Number.NaN, 10);
    appendShapeRectangle(shape, Number.NaN, 0, Number.NaN, 10);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands, resolvers)).not.toThrow();
  });

  it('does not throw on Infinity coordinates', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeMoveTo(shape, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
    appendShapeLineTo(shape, Number.POSITIVE_INFINITY, 0);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands, resolvers)).not.toThrow();
  });

  it('does not throw on very large coordinates', () => {
    const context = makeContext();
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000, 1);
    appendShapeRectangle(shape, -1e20, -1e20, 2e20, 2e20);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands, resolvers)).not.toThrow();
  });

  it('does not throw on a singular bitmap-fill matrix', () => {
    const context = makeContext();
    const bitmapSource = document.createElement('canvas');
    bitmapSource.width = 50;
    bitmapSource.height = 50;
    const bitmap = createTexture({
      dimension: '2d',
      source: createImageResource(bitmapSource),
    });
    const singular = createMatrix(0, 0, 0, 0, 0, 0);
    const shape = createShape();
    appendShapeBeginTextureFill(shape, bitmap, singular);
    appendShapeRectangle(shape, 0, 0, 100, 100);
    appendShapeEndFill(shape);
    expect(() => renderCanvasShapeCommands(context, shape.data.commands, resolvers)).not.toThrow();
  });

  it('skips an unknown command key without throwing', () => {
    const context = makeContext();
    const fillSpy = vi.spyOn(context, 'fill');
    // Raw buffer: [key, argCount, ...args]. The unknown key has no registered
    // handler, so getCanvasShapeCommand returns the undefined sentinel and the
    // walk advances past it rather than throwing.
    const commands: unknown[] = ['acme.unknownCommand', 2, 1, 2];
    expect(() => renderCanvasShapeCommands(context, commands, resolvers)).not.toThrow();
    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('records an unknown command key through the shared registry-miss seam', () => {
    const context = makeContext();
    const state = createCanvasRenderState(context.canvas);
    enableRenderRegistryGuards(state);
    renderCanvasShapeCommands(context, ['acme.unknownCommand', 0], resolvers, state);
    expect(explainRenderRegistryMisses(state)).toEqual({
      misses: [{ kind: 'acme.unknownCommand', registry: RenderRegistry.ShapeCommandHandler }],
      status: 'misses-recorded',
    });
  });

  it('does not record a registered command handler as a registry miss', () => {
    const context = makeContext();
    const state = createCanvasRenderState(context.canvas);
    enableRenderRegistryGuards(state);
    const shape = createShape();
    appendShapeRectangle(shape, 0, 0, 10, 10);
    renderCanvasShapeCommands(context, shape.data.commands, resolvers, state);
    expect(explainRenderRegistryMisses(state)).toEqual({ misses: [], status: 'complete' });
  });
});
