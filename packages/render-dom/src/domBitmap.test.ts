import { createBitmap } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { createImageResource, createImageResourceFromCanvas } from '@flighthq/resources';
import { BitmapKind } from '@flighthq/types';

import { defaultDOMBitmapRenderer, drawDOMBitmap, drawDOMBitmapMask } from './domBitmap';
import { createDOMRenderState } from './domRenderState';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

function makeHTMLImageSource() {
  const img = document.createElement('img') as HTMLImageElement;
  img.src = 'test.png';
  const source = createImageResource(img);
  source.width = 64;
  source.height = 64;
  return source;
}

function makeCanvasImageSource() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  return createImageResourceFromCanvas(canvas);
}

describe('defaultDOMBitmapRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDOMBitmapRenderer.submit).toBe('function');
    expect(typeof defaultDOMBitmapRenderer.createData).toBe('function');
  });
});

describe('drawDOMBitmap', () => {
  it('does nothing when imageSource is null', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = null;
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const el = drawGetEl(state, () => drawDOMBitmap(state, renderProxy));

    expect(el).toBeNull();
  });

  it('produces an img element when source is HTMLImageElement', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeHTMLImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const el = drawGetEl(state, () => drawDOMBitmap(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('IMG');
  });

  it('produces a canvas element when source is not HTMLImageElement', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeCanvasImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const el = drawGetEl(state, () => drawDOMBitmap(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('CANVAS');
  });

  it('reuses the same img element across multiple draws', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeHTMLImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const firstImg = drawGetEl(state, () => drawDOMBitmap(state, renderProxy));
    const secondImg = drawGetEl(state, () => drawDOMBitmap(state, renderProxy));

    expect(firstImg).toBe(secondImg);
  });

  it('sets canvas dimensions to match image source', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeCanvasImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const canvas = drawGetEl(state, () => drawDOMBitmap(state, renderProxy)) as HTMLCanvasElement;
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
  });
});

describe('drawDOMBitmapMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const bitmap = createBitmap();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(() => drawDOMBitmapMask(state, renderProxy)).not.toThrow();
  });
});
