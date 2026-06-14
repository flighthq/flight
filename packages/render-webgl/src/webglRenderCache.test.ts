import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { getOrCreateDisplayObjectRenderNode, ImageRenderCacheKind } from '@flighthq/render';

import {
  defaultWebGLRenderImageCacheRenderer,
  drawWebGLImageCacheResult,
  enableWebGLRenderImageCache,
} from './webglRenderCache';
import { createWebGLRenderState } from './webglRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  return createWebGLRenderState(canvas);
}

function makeImageSource(canvas: HTMLCanvasElement) {
  return { src: canvas, width: canvas.width, height: canvas.height, version: 0 } as any;
}

describe('drawWebGLImageCacheResult', () => {
  it('does not throw when source is null', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);

    expect(() => drawWebGLImageCacheResult(state, data, { source: null, transform: createMatrix() })).not.toThrow();
  });

  it('does not throw when source.src is null', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const imageSource = { src: null, width: 32, height: 32, version: 0 } as any;

    expect(() =>
      drawWebGLImageCacheResult(state, data, { source: imageSource, transform: createMatrix() }),
    ).not.toThrow();
  });

  it('does not throw when source dimensions are zero', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const canvas = document.createElement('canvas');
    const imageSource = { src: canvas, width: 0, height: 0, version: 0 } as any;

    expect(() =>
      drawWebGLImageCacheResult(state, data, { source: imageSource, transform: createMatrix() }),
    ).not.toThrow();
  });

  it('does not throw when source is valid', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.alpha = 1;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const imageSource = makeImageSource(canvas);

    expect(() =>
      drawWebGLImageCacheResult(state, data, { source: imageSource, transform: createMatrix() }),
    ).not.toThrow();
  });
});

describe('enableWebGLRenderImageCache', () => {
  it('registers the image cache renderer for the image cache kind', () => {
    const state = makeState();
    enableWebGLRenderImageCache(state);
    expect(state.rendererMap.get(ImageRenderCacheKind)).toBe(defaultWebGLRenderImageCacheRenderer);
  });
});
