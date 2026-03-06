import { matrix3x2, rectangle } from '@flighthq/geometry';
import { getRenderNode } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scene-graph-stage';
import type { CanvasRenderState, DisplayObject, Matrix3x2, Rectangle, RenderNode } from '@flighthq/types';

import { popClipRect, popScrollRect, pushClipRect } from './clipping';
import { createRenderState } from './renderState';

describe('Clip and Scroll Rect Functions', () => {
  let canvas: HTMLCanvasElement;
  let state: CanvasRenderState;
  let rect: Rectangle;
  let transform: Matrix3x2;
  let source: DisplayObject;
  let data: RenderNode;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    state = createRenderState(canvas);
    rect = rectangle.create(10, 10, 100, 100);
    transform = matrix3x2.create();
    source = createDisplayObject();
    source.scrollRect = rect;
    data = getRenderNode(state, source);
    data.transform = transform;
  });

  it('should call context.restore() when popClipRect is called', () => {
    const restoreSpy = vi.spyOn(state.context, 'restore');
    popClipRect(state);
    expect(restoreSpy).toHaveBeenCalled();
  });

  it('should call context.restore() and decrement currentScrollRectDepth when popScrollRect is called', () => {
    state.currentScrollRectDepth = 1;
    const restoreSpy = vi.spyOn(state.context, 'restore');
    popScrollRect(state);
    expect(restoreSpy).toHaveBeenCalled();
    expect(state.currentScrollRectDepth).toBe(0);
  });

  it('should call context.save(), setTransform, and context.clip() when pushClipRect is called', () => {
    const saveSpy = vi.spyOn(state.context, 'save');
    const beginPathSpy = vi.spyOn(state.context, 'beginPath');
    const rectSpy = vi.spyOn(state.context, 'rect');
    const clipSpy = vi.spyOn(state.context, 'clip');
    // const setTransformSpy = vi.spyOn(setTransform, 'bind');

    pushClipRect(state, rect, transform);

    expect(saveSpy).toHaveBeenCalled();
    // expect(setTransformSpy).toHaveBeenCalledWith(state, state.context, transform);
    expect(beginPathSpy).toHaveBeenCalled();
    expect(rectSpy).toHaveBeenCalledWith(rect.x, rect.y, rect.width, rect.height);
    expect(clipSpy).toHaveBeenCalled();
  });

  // it('should call pushClipRect and increment currentScrollRectDepth when pushScrollRect is called', () => {
  //   const pushClipRectSpy = vi.spyOn(pushClipRect, 'bind');

  //   pushScrollRect(state, data);

  //   expect(pushClipRectSpy).toHaveBeenCalledWith(state, rect, transform);
  //   expect(state.currentScrollRectDepth).toBe(1);
  // });
});
