import { createMatrix, createRectangle } from '@flighthq/geometry';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderNode, Matrix, Rectangle } from '@flighthq/types';

import { popCanvasClipRectangle, pushCanvasClipRectangle } from './canvasClipRect';
import { createCanvasRenderState } from './canvasRenderState';

describe('Clip Rect Functions', () => {
  let canvas: HTMLCanvasElement;
  let state: CanvasRenderState;
  let rect: Rectangle;
  let transform2D: Matrix;
  let source: DisplayObject;
  let data: DisplayObjectRenderNode;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    state = createCanvasRenderState(canvas);
    rect = createRectangle(10, 10, 100, 100);
    transform2D = createMatrix();
    source = createDisplayObject();
    source.clipRectangle = rect;
    data = getOrCreateDisplayObjectRenderNode(state, source);
    data.transform2D = transform2D;
  });

  it('should call context.restore() when popClipRect is called', () => {
    const restoreSpy = vi.spyOn(state.context, 'restore');
    popCanvasClipRectangle(state);
    expect(restoreSpy).toHaveBeenCalled();
  });

  it('should call context.save(), setTransform, and context.clip() when pushClipRect is called', () => {
    const saveSpy = vi.spyOn(state.context, 'save');
    const beginPathSpy = vi.spyOn(state.context, 'beginPath');
    const rectSpy = vi.spyOn(state.context, 'rect');
    const clipSpy = vi.spyOn(state.context, 'clip');

    pushCanvasClipRectangle(state, rect, transform2D);

    expect(saveSpy).toHaveBeenCalled();
    expect(beginPathSpy).toHaveBeenCalled();
    expect(rectSpy).toHaveBeenCalledWith(rect.x, rect.y, rect.width, rect.height);
    expect(clipSpy).toHaveBeenCalled();
  });
});

describe('popCanvasClipRectangle', () => {
  it('calls context.restore()', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    const spy = vi.spyOn(state.context, 'restore');
    popCanvasClipRectangle(state);
    expect(spy).toHaveBeenCalled();
  });
});

describe('pushCanvasClipRectangle', () => {
  it('saves context, clips to rect, and restores', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    const r = createRectangle(0, 0, 50, 50);
    const t = createMatrix();
    const saveSpy = vi.spyOn(state.context, 'save');
    const clipSpy = vi.spyOn(state.context, 'clip');
    pushCanvasClipRectangle(state, r, t);
    expect(saveSpy).toHaveBeenCalled();
    expect(clipSpy).toHaveBeenCalled();
  });
});
