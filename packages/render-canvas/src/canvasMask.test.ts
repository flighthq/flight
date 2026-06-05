import { createMatrix } from '@flighthq/geometry';
import { registerDisplayObjectMaskRenderer } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene-display';
import { DisplayObjectKind } from '@flighthq/types';

import { enableCanvasMaskSupport } from './canvasClip';
import { drawCanvasMask, popCanvasMask, pushCanvasMask } from './canvasMask';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('drawCanvasMask', () => {
  it('calls renderer.drawMask when renderer is set', () => {
    const state = makeState();
    const drawMaskFn = vi.fn();
    registerDisplayObjectMaskRenderer(state, DisplayObjectKind, { drawMask: drawMaskFn });

    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);

    drawCanvasMask(state, data);

    expect(drawMaskFn).toHaveBeenCalledOnce();
  });

  it('does not throw when renderer is null', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.renderer = null;

    expect(() => drawCanvasMask(state, data)).not.toThrow();
  });
});

describe('enableCanvasMaskSupport', () => {
  it('sets canvas mask hooks on the render state', () => {
    const state = makeState();

    enableCanvasMaskSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});

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
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.transform2D = createMatrix();

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
    registerDisplayObjectMaskRenderer(state, DisplayObjectKind, { drawMask: drawMaskFn });

    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.transform2D = createMatrix();

    pushCanvasMask(state, data);

    expect(drawMaskFn).toHaveBeenCalledOnce();
  });
});
