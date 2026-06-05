import { getOrCreateDisplayObjectRenderNode, prepareDisplayObjectRender, registerRenderer } from '@flighthq/render';
import { addSceneChild } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
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
  it('has draw, and createData', () => {
    expect(typeof defaultCanvasDisplayObjectRenderer.draw).toBe('function');
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
    prepareDisplayObjectRender(state, obj);
    expect(() => renderCanvasDisplayObject(state, obj)).not.toThrow();
  });

  it('calls renderer.draw for a visible object with a renderer', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const renderer = { createData: vi.fn().mockReturnValue(null), draw: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, obj);

    renderCanvasDisplayObject(state, obj);

    expect(renderer.draw).toHaveBeenCalledOnce();
  });

  it('does not call renderer.draw for a hidden object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.visible = false;
    const renderer = { createData: vi.fn().mockReturnValue(null), draw: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, obj);

    renderCanvasDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('traverses and draws children', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addSceneChild(parent, child);
    const renderer = { createData: vi.fn().mockReturnValue(null), draw: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, parent);

    renderCanvasDisplayObject(state, parent);

    expect(renderer.draw).toHaveBeenCalledTimes(2);
  });
});
