import { createImageSource } from '@flighthq/assets';
import { createBitmap } from '@flighthq/displayobject';
import { createRectangle } from '@flighthq/geometry';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
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

describe('defaultCanvasBitmapRenderer', () => {
  it('has submit and createData', () => {
    expect(typeof defaultCanvasBitmapRenderer.submit).toBe('function');
    expect(typeof defaultCanvasBitmapRenderer.createData).toBe('function');
  });
});

describe('drawCanvasBitmap', () => {
  it('calls drawImage when bitmap has a valid image source', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeImageSource();
    const data = getOrCreateDisplayObjectRenderNode(state, bitmap);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasBitmap(state, data);

    expect(spy).toHaveBeenCalledOnce();
  });

  it('skips drawImage when image source is null', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = null;
    const data = getOrCreateDisplayObjectRenderNode(state, bitmap);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasBitmap(state, data);

    expect(spy).not.toHaveBeenCalled();
  });

  it('crops to sourceRectangle when set', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeImageSource();
    bitmap.data.sourceRectangle = createRectangle(10, 20, 32, 32);
    const data = getOrCreateDisplayObjectRenderNode(state, bitmap);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasBitmap(state, data);

    expect(spy).toHaveBeenCalledOnce();
    const args = spy.mock.calls[0] as number[];
    expect(args[1]).toBe(10); // sx
    expect(args[2]).toBe(20); // sy
    expect(args[3]).toBe(32); // sw
    expect(args[4]).toBe(32); // sh
    expect(args[5]).toBe(0); // dx
    expect(args[6]).toBe(0); // dy
  });

  it('disables imageSmoothingEnabled when smoothing is false', () => {
    const state = makeState();
    state.allowSmoothing = true;
    const bitmap = createBitmap();
    bitmap.data.image = makeImageSource();
    bitmap.data.smoothing = false;
    const data = getOrCreateDisplayObjectRenderNode(state, bitmap);

    drawCanvasBitmap(state, data);

    expect(state.context.imageSmoothingEnabled).toBe(true); // restored after draw
  });
});

describe('drawCanvasBitmapMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const bitmap = createBitmap();
    const data = getOrCreateDisplayObjectRenderNode(state, bitmap);

    expect(() => drawCanvasBitmapMask(state, data)).not.toThrow();
  });
});
