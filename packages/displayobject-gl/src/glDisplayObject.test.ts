import { createDisplayObject } from '@flighthq/displayobject';
import { addNodeChild } from '@flighthq/node';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender, registerRenderer } from '@flighthq/render';
import { createGlRenderState } from '@flighthq/render-gl';
import type { GlRenderState } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { defaultGlDisplayObjectRenderer, drawGlDisplayObject, renderGlDisplayObject } from './glDisplayObject';

function makeState(): GlRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  return createGlRenderState(canvas);
}

function makeRenderer() {
  return {
    createData: () => null,
    submit: vi.fn(),
  } as any;
}

describe('defaultGlDisplayObjectRenderer', () => {
  it('has draw, and createData functions', () => {
    expect(defaultGlDisplayObjectRenderer.createData({} as any, {} as any)).toBeNull();
    expect(defaultGlDisplayObjectRenderer.submit).toBe(drawGlDisplayObject);
  });
});

describe('drawGlDisplayObject', () => {
  it('does not draw plain display object geometry', () => {
    const state = makeState();
    expect(() => drawGlDisplayObject(state, {} as any)).not.toThrow();
  });
});

describe('renderGlDisplayObject', () => {
  it('does not throw for an empty display object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    prepareDisplayObjectRender(state, obj);
    expect(() => renderGlDisplayObject(state, obj)).not.toThrow();
  });

  it('calls renderer.submit for a visible object with a renderer', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const obj = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, obj);
    prepareDisplayObjectRender(state, obj);

    renderGlDisplayObject(state, obj);

    expect(renderer.submit).toHaveBeenCalledWith(state, data);
  });

  it('skips objects with zero alpha', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const obj = createDisplayObject();
    obj.alpha = 0;
    prepareDisplayObjectRender(state, obj);

    renderGlDisplayObject(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('traverses children and draws visible ones', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(parent, child);
    prepareDisplayObjectRender(state, parent);

    renderGlDisplayObject(state, parent);

    expect(renderer.submit).toHaveBeenCalledTimes(2);
  });
});
