import { createMatrix } from '@flighthq/geometry';
import { getOrCreateDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { addGraphChild } from '@flighthq/scenegraph-core';
import { createDisplayObject, getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { ImageCacheResult } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import {
  defaultCanvasDisplayObjectRenderer,
  drawCanvasDisplayObject,
  drawCanvasDisplayObjectMask,
  renderCanvasDisplayObject,
} from './canvasDisplayObject';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const state = createCanvasRenderState(canvas);
  registerRenderer(state, DisplayObjectKind, defaultCanvasDisplayObjectRenderer);
  return state;
}

describe('defaultCanvasDisplayObjectRenderer', () => {
  it('has draw, drawMask, and createData', () => {
    expect(typeof defaultCanvasDisplayObjectRenderer.draw).toBe('function');
    expect(typeof defaultCanvasDisplayObjectRenderer.drawMask).toBe('function');
    expect(typeof defaultCanvasDisplayObjectRenderer.createData).toBe('function');
  });
});

describe('drawCanvasDisplayObject', () => {
  it('does not throw', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    expect(() => drawCanvasDisplayObject(state, data)).not.toThrow();
  });

  it('does not call fillRect (no visual geometry)', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const spy = vi.spyOn(state.context, 'fillRect');

    drawCanvasDisplayObject(state, data);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('drawCanvasDisplayObjectMask', () => {
  it('does not throw when no children', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    expect(() => drawCanvasDisplayObjectMask(state, data)).not.toThrow();
  });

  it('does not call context.rect for a childless display object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    const rectSpy = vi.spyOn(state.context, 'rect');

    drawCanvasDisplayObjectMask(state, data);

    expect(rectSpy).not.toHaveBeenCalled();
  });
});

describe('renderCanvasDisplayObject', () => {
  it('does not throw for a simple visible object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.visible = true;

    expect(() => renderCanvasDisplayObject(state, obj)).not.toThrow();
  });

  it('skips invisible objects', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.visible = false;
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = false;
    const drawImageSpy = vi.spyOn(state.context, 'drawImage');

    renderCanvasDisplayObject(state, obj);

    expect(drawImageSpy).not.toHaveBeenCalled();
  });

  it('draws from imageCache slot when source is set', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 50;
    const runtime = getDisplayObjectRuntime(obj) as ReturnType<typeof getDisplayObjectRuntime>;
    (runtime as { imageCache: ImageCacheResult | null }).imageCache = {
      source: { src: canvas, width: canvas.width, height: canvas.height, version: 0 } as any,
      transform: createMatrix(),
    };

    const drawImageSpy = vi.spyOn(state.context, 'drawImage');
    renderCanvasDisplayObject(state, obj);

    expect(drawImageSpy).toHaveBeenCalledOnce();
  });

  it('recurses into children with cached results', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 50;
    const childRuntime = getDisplayObjectRuntime(child);
    (childRuntime as { imageCache: ImageCacheResult | null }).imageCache = {
      source: { src: canvas, width: canvas.width, height: canvas.height, version: 0 } as any,
      transform: createMatrix(),
    };
    addGraphChild(parent, child);

    const drawImageSpy = vi.spyOn(state.context, 'drawImage');
    renderCanvasDisplayObject(state, parent);

    expect(drawImageSpy).toHaveBeenCalledOnce();
  });
});
