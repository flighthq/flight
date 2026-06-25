import { createBitmap } from '@flighthq/displayobject';
import { createImageResource, createImageResourceFromCanvas } from '@flighthq/image';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { BitmapKind } from '@flighthq/types';

import { defaultDomBitmapRenderer, drawDomBitmap } from './domBitmap';
import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';

function makeState(pixelRatio = 1) {
  const container = document.createElement('div');
  const state = createDomRenderState(container, { pixelRatio });
  registerRenderer(state, BitmapKind, defaultDomBitmapRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDomRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDomRenderStateRuntime(state).domCurrentElement;
}

function makeHtmlImageSource() {
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

describe('defaultDomBitmapRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDomBitmapRenderer.submit).toBe('function');
    expect(typeof defaultDomBitmapRenderer.createData).toBe('function');
  });
});

describe('drawDomBitmap', () => {
  it('does nothing when imageSource is null', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = null;
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const el = drawGetEl(state, () => drawDomBitmap(state, renderProxy));

    expect(el).toBeNull();
  });

  it('produces an img element when source is HTMLImageElement', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeHtmlImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const el = drawGetEl(state, () => drawDomBitmap(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('IMG');
  });

  it('produces a canvas element when source is not HTMLImageElement', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeCanvasImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const el = drawGetEl(state, () => drawDomBitmap(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('CANVAS');
  });

  it('reuses the same img element across multiple draws', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeHtmlImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const firstImg = drawGetEl(state, () => drawDomBitmap(state, renderProxy));
    const secondImg = drawGetEl(state, () => drawDomBitmap(state, renderProxy));

    expect(firstImg).toBe(secondImg);
  });

  it('sets canvas dimensions to match image source', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeCanvasImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const canvas = drawGetEl(state, () => drawDomBitmap(state, renderProxy)) as HTMLCanvasElement;
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
  });

  it('sizes the backing canvas at physical pixels and constrains layout to logical pixels on HiDPI', () => {
    const state = makeState(2);
    const bitmap = createBitmap();
    bitmap.data.image = makeCanvasImageSource();
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    const canvas = drawGetEl(state, () => drawDomBitmap(state, renderProxy)) as HTMLCanvasElement;
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
    expect(canvas.style.width).toBe('64px');
    expect(canvas.style.height).toBe('64px');
  });
});
