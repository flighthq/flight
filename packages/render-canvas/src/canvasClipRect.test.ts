import { createMatrix, createRectangle } from '@flighthq/geometry';
import { getDisplayObjectRenderNode } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderNode, Matrix, Rectangle } from '@flighthq/types';

import { popCanvasClipRect, popCanvasScrollRect, pushCanvasClipRect, pushCanvasScrollRect } from './canvasClipRect';
import { createCanvasRenderState } from './canvasRenderState';

describe('Clip and Scroll Rect Functions', () => {
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
    source.scrollRect = rect;
    data = getDisplayObjectRenderNode(state, source);
    data.transform2D = transform2D;
  });

  it('should call context.restore() when popClipRect is called', () => {
    const restoreSpy = vi.spyOn(state.context, 'restore');
    popCanvasClipRect(state);
    expect(restoreSpy).toHaveBeenCalled();
  });

  it('should call context.restore() and decrement currentScrollRectDepth when popScrollRect is called', () => {
    state.currentScrollRectDepth = 1;
    const restoreSpy = vi.spyOn(state.context, 'restore');
    popCanvasScrollRect(state);
    expect(restoreSpy).toHaveBeenCalled();
    expect(state.currentScrollRectDepth).toBe(0);
  });

  it('should call context.save(), setTransform, and context.clip() when pushClipRect is called', () => {
    const saveSpy = vi.spyOn(state.context, 'save');
    const beginPathSpy = vi.spyOn(state.context, 'beginPath');
    const rectSpy = vi.spyOn(state.context, 'rect');
    const clipSpy = vi.spyOn(state.context, 'clip');
    // const setTransformSpy = vi.spyOn(setTransform, 'bind');

    pushCanvasClipRect(state, rect, transform2D);

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

describe('popCanvasClipRect', () => {
  it('calls context.restore()', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    const spy = vi.spyOn(state.context, 'restore');
    popCanvasClipRect(state);
    expect(spy).toHaveBeenCalled();
  });
});

describe('popCanvasScrollRect', () => {
  it('calls context.restore() and decrements currentScrollRectDepth', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    state.currentScrollRectDepth = 1;
    const spy = vi.spyOn(state.context, 'restore');
    popCanvasScrollRect(state);
    expect(spy).toHaveBeenCalled();
    expect(state.currentScrollRectDepth).toBe(0);
  });
});

describe('pushCanvasClipRect', () => {
  it('saves context, clips to rect, and restores', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    const r = createRectangle(0, 0, 50, 50);
    const t = createMatrix();
    const saveSpy = vi.spyOn(state.context, 'save');
    const clipSpy = vi.spyOn(state.context, 'clip');
    pushCanvasClipRect(state, r, t);
    expect(saveSpy).toHaveBeenCalled();
    expect(clipSpy).toHaveBeenCalled();
  });
});

describe('pushCanvasScrollRect', () => {
  it('increments currentScrollRectDepth', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    const source = createDisplayObject();
    source.scrollRect = createRectangle(0, 0, 50, 50);
    const data = getDisplayObjectRenderNode(state, source);
    data.transform2D = createMatrix();
    const before = state.currentScrollRectDepth;
    pushCanvasScrollRect(state, data);
    expect(state.currentScrollRectDepth).toBe(before + 1);
  });
});
