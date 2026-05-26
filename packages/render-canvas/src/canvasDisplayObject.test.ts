import { rectangle } from '@flighthq/geometry';
import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { addChild, getLocalBoundsRect } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
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

describe('drawCanvasDisplayObject', () => {
  it('calls fillRect when opaqueBackground is set', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.opaqueBackground = 0xff0000;
    rectangle.setTo(getLocalBoundsRect(obj), 0, 0, 50, 50);
    const data = getDisplayObjectRenderNode(state, obj);
    const fillSpy = vi.spyOn(state.context, 'fillRect');

    drawCanvasDisplayObject(state, data);

    expect(fillSpy).toHaveBeenCalledOnce();
  });

  it('skips fillRect when opaqueBackground is null', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.opaqueBackground = null;
    const data = getDisplayObjectRenderNode(state, obj);
    const fillSpy = vi.spyOn(state.context, 'fillRect');

    drawCanvasDisplayObject(state, data);

    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('sets fillStyle from the packed opaqueBackground color', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.opaqueBackground = (0xab << 16) | (0xcd << 8) | 0xef;
    rectangle.setTo(getLocalBoundsRect(obj), 0, 0, 10, 10);
    const data = getDisplayObjectRenderNode(state, obj);

    drawCanvasDisplayObject(state, data);

    expect(state.context.fillStyle).toBe('#abcdef');
  });
});

describe('renderCanvasDisplayObject', () => {
  it('does not throw for a simple visible object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.opaqueBackground = 0xff0000;
    obj.visible = true;
    rectangle.setTo(getLocalBoundsRect(obj), 0, 0, 50, 50);

    expect(() => renderCanvasDisplayObject(state, obj)).not.toThrow();
  });

  it('skips invisible objects', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.opaqueBackground = 0xff0000;
    obj.visible = false;
    const data = getDisplayObjectRenderNode(state, obj);
    data.visible = false;
    rectangle.setTo(getLocalBoundsRect(obj), 0, 0, 50, 50);
    const fillSpy = vi.spyOn(state.context, 'fillRect');

    renderCanvasDisplayObject(state, obj);

    expect(fillSpy).not.toHaveBeenCalled();
  });

  it('recurses into children', () => {
    const state = makeState();
    const parent = createDisplayObject();
    parent.opaqueBackground = null;

    const child = createDisplayObject();
    child.opaqueBackground = 0x00ff00;
    rectangle.setTo(getLocalBoundsRect(child), 0, 0, 20, 20);
    addChild(parent, child);

    const fillSpy = vi.spyOn(state.context, 'fillRect');

    renderCanvasDisplayObject(state, parent);

    expect(fillSpy).toHaveBeenCalledOnce();
  });
});

describe('defaultCanvasDisplayObjectRenderer', () => {
  it('has draw, drawMask, and createData', () => {
    expect(typeof defaultCanvasDisplayObjectRenderer.draw).toBe('function');
    expect(typeof defaultCanvasDisplayObjectRenderer.drawMask).toBe('function');
    expect(typeof defaultCanvasDisplayObjectRenderer.createData).toBe('function');
  });
});

describe('drawCanvasDisplayObjectMask', () => {
  it('does not throw when opaqueBackground is null and no children', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.opaqueBackground = null;
    const data = getDisplayObjectRenderNode(state, obj);
    expect(() => drawCanvasDisplayObjectMask(state, data)).not.toThrow();
  });

  it('calls context.rect when opaqueBackground is set', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.opaqueBackground = 0xff0000;
    rectangle.setTo(getLocalBoundsRect(obj), 0, 0, 50, 50);
    const data = getDisplayObjectRenderNode(state, obj);
    const rectSpy = vi.spyOn(state.context, 'rect');
    drawCanvasDisplayObjectMask(state, data);
    expect(rectSpy).toHaveBeenCalled();
  });
});
