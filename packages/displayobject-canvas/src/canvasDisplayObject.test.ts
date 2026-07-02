import { createDisplayObject } from '@flighthq/displayobject';
import { addNodeChild } from '@flighthq/node';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender, registerRenderer } from '@flighthq/render';
import { DisplayObjectKind } from '@flighthq/types';

import { enableCanvasCssFilter, setCanvasCssFilter } from './canvasCSSFilterBinding';
import {
  defaultCanvasDisplayObjectRenderer,
  drawCanvasDisplayObject,
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
  it('has submit, and createData', () => {
    expect(typeof defaultCanvasDisplayObjectRenderer.submit).toBe('function');
    expect(typeof defaultCanvasDisplayObjectRenderer.createData).toBe('function');
  });
});

describe('drawCanvasDisplayObject', () => {
  it('does not throw', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, obj);
    expect(() => drawCanvasDisplayObject(state, data)).not.toThrow();
  });

  it('does not call fillRect (no visual geometry)', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, obj);
    const spy = vi.spyOn(state.context, 'fillRect');

    drawCanvasDisplayObject(state, data);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('renderCanvasDisplayObject', () => {
  it('does not throw for a simple visible object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    prepareDisplayObjectRender(state, obj);
    expect(() => renderCanvasDisplayObject(state, obj)).not.toThrow();
  });

  it('calls renderer.submit for a visible object with a renderer', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const renderer = { createData: vi.fn().mockReturnValue(null), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, obj);

    renderCanvasDisplayObject(state, obj);

    expect(renderer.submit).toHaveBeenCalledOnce();
  });

  it('does not call renderer.submit for a hidden object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.visible = false;
    const renderer = { createData: vi.fn().mockReturnValue(null), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, obj);

    renderCanvasDisplayObject(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('traverses and draws children', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(parent, child);
    const renderer = { createData: vi.fn().mockReturnValue(null), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, parent);

    renderCanvasDisplayObject(state, parent);

    expect(renderer.submit).toHaveBeenCalledTimes(2);
  });

  it('applies a bound canvas filter around the node draw and resets after', () => {
    const state = makeState();
    const obj = createDisplayObject();
    let observed: string | undefined;
    const renderer = {
      createData: vi.fn().mockReturnValue(null),
      submit: vi.fn(() => {
        observed = state.context.filter;
      }),
    };
    registerRenderer(state, DisplayObjectKind, renderer);
    enableCanvasCssFilter(state);
    setCanvasCssFilter(state, obj, 'blur(3px)');
    prepareDisplayObjectRender(state, obj);

    renderCanvasDisplayObject(state, obj);

    expect(observed).toBe('blur(3px)');
    expect(state.context.filter).toBe('none');
  });
});
