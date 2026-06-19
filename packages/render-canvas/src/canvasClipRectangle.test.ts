import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix, createRectangle } from '@flighthq/geometry';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { CanvasRenderState, DisplayObject, Matrix, Rectangle, RenderProxy2D } from '@flighthq/types';

import { popCanvasClipRectangle, pushCanvasClipContours, pushCanvasClipRectangle } from './canvasClipRectangle';
import { createCanvasRenderState } from './canvasRenderState';

describe('Clip Rectangle Functions', () => {
  let canvas: HTMLCanvasElement;
  let state: CanvasRenderState;
  let rect: Rectangle;
  let transform2D: Matrix;
  let source: DisplayObject;
  let data: RenderProxy2D;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    state = createCanvasRenderState(canvas);
    rect = createRectangle(10, 10, 100, 100);
    transform2D = createMatrix();
    source = createDisplayObject();
    source.clip = { contours: null, rect, winding: 'nonZero', version: 0 };
    data = getOrCreateRenderProxy2D(state, source);
    data.transform2D = transform2D;
  });

  it('should call context.restore() when popClipRectangle is called', () => {
    const restoreSpy = vi.spyOn(state.context, 'restore');
    popCanvasClipRectangle(state);
    expect(restoreSpy).toHaveBeenCalled();
  });

  it('should call context.save(), setTransform, and context.clip() when pushClipRectangle is called', () => {
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

describe('pushCanvasClipContours', () => {
  it('saves context, traces each contour as a path, and clips', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    const t = createMatrix();
    const saveSpy = vi.spyOn(state.context, 'save');
    const beginPathSpy = vi.spyOn(state.context, 'beginPath');
    const moveToSpy = vi.spyOn(state.context, 'moveTo');
    const lineToSpy = vi.spyOn(state.context, 'lineTo');
    const clipSpy = vi.spyOn(state.context, 'clip');

    // Two triangles.
    pushCanvasClipContours(
      state,
      [
        [0, 0, 10, 0, 10, 10],
        [20, 20, 30, 20, 30, 30],
      ],
      'nonZero',
      t,
    );

    expect(saveSpy).toHaveBeenCalled();
    expect(beginPathSpy).toHaveBeenCalled();
    expect(moveToSpy).toHaveBeenCalledTimes(2); // one per contour
    expect(lineToSpy).toHaveBeenCalledTimes(4); // two segments per triangle after the moveTo
    expect(clipSpy).toHaveBeenCalled();
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
