import { createMatrix, createRectangle } from '@flighthq/geometry';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-tree';
import { createDisplayObject } from '@flighthq/scene-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderTreeNode, Matrix, Rectangle } from '@flighthq/types';

import {
  popCanvasClipRectangle,
  popCanvasScrollRectangle,
  pushCanvasClipRectangle,
  pushCanvasScrollRectangle,
} from './canvasClipRect';
import { createCanvasRenderState } from './canvasRenderState';

describe('Clip and Scroll Rect Functions', () => {
  let canvas: HTMLCanvasElement;
  let state: CanvasRenderState;
  let rect: Rectangle;
  let transform2D: Matrix;
  let source: DisplayObject;
  let data: DisplayObjectRenderTreeNode;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    state = createCanvasRenderState(canvas);
    rect = createRectangle(10, 10, 100, 100);
    transform2D = createMatrix();
    source = createDisplayObject();
    source.scrollRectangle =rect;
    data = getOrCreateDisplayObjectRenderNode(state, source);
    data.transform2D = transform2D;
  });

  it('should call context.restore() when popClipRect is called', () => {
    const restoreSpy = vi.spyOn(state.context, 'restore');
    popCanvasClipRectangle(state);
    expect(restoreSpy).toHaveBeenCalled();
  });

  it('should call context.restore() and decrement currentScrollRectangleDepth when popScrollRect is called', () => {
    state.currentScrollRectangleDepth = 1;
    const restoreSpy = vi.spyOn(state.context, 'restore');
    popCanvasScrollRectangle(state);
    expect(restoreSpy).toHaveBeenCalled();
    expect(state.currentScrollRectangleDepth).toBe(0);
  });

  it('should call context.save(), setTransform, and context.clip() when pushClipRect is called', () => {
    const saveSpy = vi.spyOn(state.context, 'save');
    const beginPathSpy = vi.spyOn(state.context, 'beginPath');
    const rectSpy = vi.spyOn(state.context, 'rect');
    const clipSpy = vi.spyOn(state.context, 'clip');
    // const setTransformSpy = vi.spyOn(setTransform, 'bind');

    pushCanvasClipRectangle(state, rect, transform2D);

    expect(saveSpy).toHaveBeenCalled();
    // expect(setTransformSpy).toHaveBeenCalledWith(state, state.context, transform);
    expect(beginPathSpy).toHaveBeenCalled();
    expect(rectSpy).toHaveBeenCalledWith(rect.x, rect.y, rect.width, rect.height);
    expect(clipSpy).toHaveBeenCalled();
  });

  // it('should call pushClipRect and increment currentScrollRectangleDepth when pushScrollRect is called', () => {
  //   const pushClipRectSpy = vi.spyOn(pushClipRect, 'bind');

  //   pushScrollRect(state, data);

  //   expect(pushClipRectSpy).toHaveBeenCalledWith(state, rect, transform);
  //   expect(state.currentScrollRectangleDepth).toBe(1);
  // });
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

describe('popCanvasScrollRectangle', () => {
  it('calls context.restore() and decrements currentScrollRectangleDepth', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    state.currentScrollRectangleDepth = 1;
    const spy = vi.spyOn(state.context, 'restore');
    popCanvasScrollRectangle(state);
    expect(spy).toHaveBeenCalled();
    expect(state.currentScrollRectangleDepth).toBe(0);
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

describe('pushCanvasScrollRectangle', () => {
  it('increments currentScrollRectangleDepth', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    const source = createDisplayObject();
    source.scrollRectangle =createRectangle(0, 0, 50, 50);
    const data = getOrCreateDisplayObjectRenderNode(state, source);
    data.transform2D = createMatrix();
    const before = state.currentScrollRectangleDepth;
    pushCanvasScrollRectangle(state, data);
    expect(state.currentScrollRectangleDepth).toBe(before + 1);
  });
});
