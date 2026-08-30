import { addNodeChild } from '@flighthq/node/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { DisplayObjectKind } from '@flighthq/types/contract';

import { enableCanvasCssFilter, setCanvasCssFilter } from './canvasCSSFilterBinding';
import { defaultCanvasScene2DRenderer, drawCanvasScene2D, renderCanvasScene2D } from './canvasNode2D';
import { createCanvasRenderState } from './canvasTestSupport';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const state = createCanvasRenderState(canvas);
  registerRenderer(state, DisplayObjectKind, defaultCanvasScene2DRenderer);
  return state;
}

describe('defaultCanvasScene2DRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultCanvasScene2DRenderer.submit).toBe('function');
    expect(typeof defaultCanvasScene2DRenderer.createData).toBe('function');
  });
});

describe('drawCanvasScene2D', () => {
  it('does not throw', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, obj);
    expect(() => drawCanvasScene2D(state, data)).not.toThrow();
  });

  it('does not call fillRect (no visual geometry)', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, obj);
    const spy = vi.spyOn(state.context, 'fillRect');

    drawCanvasScene2D(state, data);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('renderCanvasScene2D', () => {
  it('does not throw for a simple visible object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    prepareScene2DRender(state, obj);
    expect(() => renderCanvasScene2D(state, obj)).not.toThrow();
  });

  it('calls renderer.submit for a visible object with a renderer', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const renderer = { createData: vi.fn().mockReturnValue(null), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareScene2DRender(state, obj);

    renderCanvasScene2D(state, obj);

    expect(renderer.submit).toHaveBeenCalledOnce();
  });

  it('does not call renderer.submit for a hidden object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.visible = false;
    const renderer = { createData: vi.fn().mockReturnValue(null), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareScene2DRender(state, obj);

    renderCanvasScene2D(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('traverses and draws children', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(parent, child);
    const renderer = { createData: vi.fn().mockReturnValue(null), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareScene2DRender(state, parent);

    renderCanvasScene2D(state, parent);

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
    prepareScene2DRender(state, obj);

    renderCanvasScene2D(state, obj);

    expect(observed).toBe('blur(3px)');
    expect(state.context.filter).toBe('none');
  });
});
