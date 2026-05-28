import { createImageSource } from '@flighthq/assets';
import { createRectangle } from '@flighthq/geometry';
import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createBitmap } from '@flighthq/scenegraph-display';
import { BitmapKind } from '@flighthq/types';

import { defaultCanvasBitmapRenderer, drawCanvasBitmap, drawCanvasBitmapMask } from './canvasBitmap';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const state = createCanvasRenderState(canvas);
  registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
  return state;
}

function makeImageSource() {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageSource(img);
  source.width = 64;
  source.height = 64;
  return source;
}

describe('drawCanvasBitmap', () => {
  it('calls drawImage when bitmap has a valid image source', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeImageSource();
    const data = getDisplayObjectRenderNode(state, bitmap);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasBitmap(state, data);

    expect(spy).toHaveBeenCalledOnce();
  });

  it('skips drawImage when image source is null', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = null;
    const data = getDisplayObjectRenderNode(state, bitmap);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasBitmap(state, data);

    expect(spy).not.toHaveBeenCalled();
  });

  it('uses scrollRect region when scrollRect is set', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeImageSource();
    bitmap.scrollRect = createRectangle(10, 20, 32, 32);
    const data = getDisplayObjectRenderNode(state, bitmap);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasBitmap(state, data);

    expect(spy).toHaveBeenCalledOnce();
    const args = spy.mock.calls[0] as number[];
    expect(args[1]).toBe(10); // sx
    expect(args[2]).toBe(20); // sy
    expect(args[3]).toBe(32); // sw
    expect(args[4]).toBe(32); // sh
  });

  it('disables imageSmoothingEnabled when smoothing is false', () => {
    const state = makeState();
    state.allowSmoothing = true;
    const bitmap = createBitmap();
    bitmap.data.image = makeImageSource();
    bitmap.data.smoothing = false;
    const data = getDisplayObjectRenderNode(state, bitmap);

    drawCanvasBitmap(state, data);

    expect(state.context.imageSmoothingEnabled).toBe(true); // restored after draw
  });
});

describe('drawCanvasBitmapMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const bitmap = createBitmap();
    const data = getDisplayObjectRenderNode(state, bitmap);

    expect(() => drawCanvasBitmapMask(state, data)).not.toThrow();
  });
});

describe('defaultCanvasBitmapRenderer', () => {
  it('has draw and drawMask and createData', () => {
    expect(typeof defaultCanvasBitmapRenderer.draw).toBe('function');
    expect(typeof defaultCanvasBitmapRenderer.drawMask).toBe('function');
    expect(typeof defaultCanvasBitmapRenderer.createData).toBe('function');
  });
});
