import { createBitmap } from '@flighthq/bitmap/contract';
import {
  createImageResourceFromCanvas,
  createWebImageBackend,
  explainImageOperation,
  resetImageBackendForTest,
  setImageBackend,
} from '@flighthq/image/contract';
import { createRenderState } from '@flighthq/render/contract';
import { appendShapeRectangle, appendShapeBeginTextureFill, createShape } from '@flighthq/shape/contract';
import { createTexture, setTextureSource } from '@flighthq/texture/contract';
import type { RenderState } from '@flighthq/types/contract';

import { registerCanvasBitmapTextureResolver } from './canvasBitmapTextureResolver';
import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { defaultCanvasShapeCommands, defaultCanvasTextureShapeCommands } from './canvasShapeCommands';
import { createCanvasShapeRasterizer } from './canvasShapeRasterizer';
import { registerCanvasShapeCommands } from './canvasShapeRegistry';
import { createCanvasTextureResolvers } from './canvasTestSupport';

// The state the backend hands the rasterizer is where the commands live, so this is the wiring a GPU or
// DOM backend does on its own state. Texture fills are their own command set, separately registered from
// the base one, so a caller that wants bitmap-filled shapes opts into both.
function makeRasterizerState(): RenderState {
  const state = createRenderState();
  registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
  registerCanvasShapeCommands(state, defaultCanvasTextureShapeCommands);
  return state;
}

beforeEach(() => setImageBackend(createWebImageBackend()));
afterEach(() => resetImageBackendForTest());

describe('createCanvasShapeRasterizer', () => {
  it('paints a Bitmap-sourced texture fill, which is what a null render state could never do', () => {
    // The regression this exists for: a GPU backend used to rasterize with no CanvasRenderState, which
    // skipped the resolver registry and read `image.source` directly. A Bitmap has no `.source`, so the
    // fill produced no pattern and the shape drew nothing at all — SWF's lossless bitmaps, specifically.
    const { context, fills } = createRecordingContext();
    const resolvers = createCanvasTextureResolvers();
    registerCanvasBitmapTextureResolver(resolvers);

    const texture = createTexture();
    setTextureSource(texture, createBitmap(2, 2));
    const shape = createShape();
    appendShapeBeginTextureFill(shape, texture);
    appendShapeRectangle(shape, 0, 0, 10, 10);

    createCanvasShapeRasterizer(resolvers)(context, shape.data.commands, makeRasterizerState());

    expect(fills).toHaveLength(1);
    expect(fills[0]).not.toBe('');
  });

  it('paints nothing for a source kind its state has no resolver for', () => {
    // Capability follows what the caller registered on the state, not what the renderer reached for.
    const { context, fills } = createRecordingContext();
    const resolvers = createCanvasTextureResolvers();

    const texture = createTexture();
    setTextureSource(texture, createBitmap(2, 2));
    const shape = createShape();
    appendShapeBeginTextureFill(shape, texture);
    appendShapeRectangle(shape, 0, 0, 10, 10);

    createCanvasShapeRasterizer(resolvers)(context, shape.data.commands, makeRasterizerState());

    expect(fills).toEqual([]);
  });

  it('paints nothing when the registered Bitmap resolver cannot materialize on this host', () => {
    const { context, fills } = createRecordingContext();
    const resolvers = createCanvasTextureResolvers();
    registerCanvasBitmapTextureResolver(resolvers);
    resetImageBackendForTest();

    const texture = createTexture();
    setTextureSource(texture, createBitmap(2, 2));
    const shape = createShape();
    appendShapeBeginTextureFill(shape, texture);
    appendShapeRectangle(shape, 0, 0, 10, 10);

    expect(() =>
      createCanvasShapeRasterizer(resolvers)(context, shape.data.commands, makeRasterizerState()),
    ).not.toThrow();
    expect(fills).toEqual([]);
    expect(explainImageOperation('createImageFromBitmap').implemented).toBe(false);
  });

  it('resolves an Image-sourced texture through the same state', () => {
    const { context, fills } = createRecordingContext();
    const backing = document.createElement('canvas');
    backing.width = 2;
    backing.height = 2;
    const resolvers = createCanvasTextureResolvers();
    registerCanvasImageTextureResolver(resolvers);

    const texture = createTexture();
    setTextureSource(texture, createImageResourceFromCanvas(backing));
    const shape = createShape();
    appendShapeBeginTextureFill(shape, texture);
    appendShapeRectangle(shape, 0, 0, 10, 10);

    createCanvasShapeRasterizer(resolvers)(context, shape.data.commands, makeRasterizerState());

    expect(fills).toHaveLength(1);
  });
});

// Records every paint the replay performs, which is what distinguishes "painted the texture" from "drew
// the path with no paint" — the exact difference the null-state defect turned into silence. A rectangle
// under a resolved texture takes the drawImage fast path rather than filling, so both count as paint.
function createRecordingContext(): { context: CanvasRenderingContext2D; fills: unknown[] } {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  const fills: unknown[] = [];
  const fill = context.fill.bind(context);
  const drawImage = context.drawImage.bind(context);
  context.fill = ((...args: unknown[]) => {
    fills.push(context.fillStyle);
    return (fill as (...a: unknown[]) => void)(...args);
  }) as typeof context.fill;
  context.drawImage = ((...args: unknown[]) => {
    fills.push(args[0]);
    return (drawImage as (...a: unknown[]) => void)(...args);
  }) as typeof context.drawImage;
  return { context, fills };
}
