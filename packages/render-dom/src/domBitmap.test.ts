import { createImageSource, createImageSourceFromCanvas } from '@flighthq/assets';
import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createBitmap } from '@flighthq/scenegraph-display';
import { BitmapKind } from '@flighthq/types';

import { defaultDOMBitmapRenderer, drawDOMBitmap, drawDOMBitmapMask } from './domBitmap';
import { createDOMRenderState } from './domRenderState';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
  return state;
}

function makeHTMLImageSource() {
  const img = document.createElement('img') as HTMLImageElement;
  img.src = 'test.png';
  const source = createImageSource(img);
  source.width = 64;
  source.height = 64;
  return source;
}

function makeCanvasImageSource() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  return createImageSourceFromCanvas(canvas);
}

describe('drawDOMBitmap', () => {
  it('does nothing when imageSource is null', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = null;
    const renderNode = getDisplayObjectRenderNode(state, bitmap);

    drawDOMBitmap(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('appends an img element when source is HTMLImageElement', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeHTMLImageSource();
    const renderNode = getDisplayObjectRenderNode(state, bitmap);

    drawDOMBitmap(state, renderNode);

    expect(state.element.children.length).toBe(1);
    expect(state.element.children[0].tagName).toBe('IMG');
  });

  it('appends a canvas element when source is not HTMLImageElement', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeCanvasImageSource();
    const renderNode = getDisplayObjectRenderNode(state, bitmap);

    drawDOMBitmap(state, renderNode);

    expect(state.element.children.length).toBe(1);
    expect(state.element.children[0].tagName).toBe('CANVAS');
  });

  it('reuses the same img element across multiple draws', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeHTMLImageSource();
    const renderNode = getDisplayObjectRenderNode(state, bitmap);

    drawDOMBitmap(state, renderNode);
    const firstImg = state.element.children[0];

    // Simulate a second frame — clear and redraw
    while (state.element.firstChild) state.element.removeChild(state.element.firstChild);
    drawDOMBitmap(state, renderNode);
    const secondImg = state.element.children[0];

    expect(firstImg).toBe(secondImg);
  });

  it('sets canvas dimensions to match image source', () => {
    const state = makeState();
    const bitmap = createBitmap();
    bitmap.data.image = makeCanvasImageSource();
    const renderNode = getDisplayObjectRenderNode(state, bitmap);

    drawDOMBitmap(state, renderNode);

    const canvas = state.element.children[0] as HTMLCanvasElement;
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
  });
});

describe('drawDOMBitmapMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const bitmap = createBitmap();
    const renderNode = getDisplayObjectRenderNode(state, bitmap);
    expect(() => drawDOMBitmapMask(state, renderNode)).not.toThrow();
  });
});

describe('defaultDOMBitmapRenderer', () => {
  it('has draw, drawMask, and createData', () => {
    expect(typeof defaultDOMBitmapRenderer.draw).toBe('function');
    expect(typeof defaultDOMBitmapRenderer.drawMask).toBe('function');
    expect(typeof defaultDOMBitmapRenderer.createData).toBe('function');
  });
});
