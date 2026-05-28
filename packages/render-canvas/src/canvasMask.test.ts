import { createMatrix3x2 } from '@flighthq/geometry';
import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import type { DisplayObjectRenderer } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { applyCanvasMask, popCanvasMask, pushCanvasMask } from './canvasMask';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('popCanvasMask', () => {
  it('calls context.restore()', () => {
    const state = makeState();
    const spy = vi.spyOn(state.context, 'restore');

    popCanvasMask(state);

    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('pushCanvasMask', () => {
  it('calls save, beginPath, closePath, and clip', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);
    data.transform2D = createMatrix3x2();

    const saveSpy = vi.spyOn(state.context, 'save');
    const beginPathSpy = vi.spyOn(state.context, 'beginPath');
    const clipSpy = vi.spyOn(state.context, 'clip');

    pushCanvasMask(state, data);

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(beginPathSpy).toHaveBeenCalledOnce();
    expect(clipSpy).toHaveBeenCalledOnce();
  });

  it('calls drawMask on the renderer when present', () => {
    const state = makeState();
    const drawMaskFn = vi.fn();
    const renderer: DisplayObjectRenderer = {
      createData: () => null,
      draw: vi.fn(),
      drawMask: drawMaskFn,
    };
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);
    data.transform2D = createMatrix3x2();

    pushCanvasMask(state, data);

    expect(drawMaskFn).toHaveBeenCalledOnce();
  });
});

describe('applyCanvasMask', () => {
  it('calls renderer.drawMask when renderer is set', () => {
    const state = makeState();
    const drawMaskFn = vi.fn();
    const renderer: DisplayObjectRenderer = {
      createData: () => null,
      draw: vi.fn(),
      drawMask: drawMaskFn,
    };
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);

    applyCanvasMask(state, data);

    expect(drawMaskFn).toHaveBeenCalledOnce();
  });

  it('does not throw when renderer is null', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getDisplayObjectRenderNode(state, obj);
    data.renderer = null;

    expect(() => applyCanvasMask(state, data)).not.toThrow();
  });
});
