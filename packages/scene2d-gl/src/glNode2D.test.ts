import { addNodeChild } from '@flighthq/node';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createGlRenderState } from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import type { GlRenderState } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { defaultGlScene2DRenderer, drawGlScene2D, renderGlScene2D } from './glNode2D';

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

describe('defaultGlScene2DRenderer', () => {
  it('has draw, and createData functions', () => {
    expect(defaultGlScene2DRenderer.createData({} as any, {} as any)).toBeNull();
    expect(defaultGlScene2DRenderer.submit).toBe(drawGlScene2D);
  });
});

describe('drawGlScene2D', () => {
  it('does not draw plain display object geometry', () => {
    const state = makeState();
    expect(() => drawGlScene2D(state, {} as any)).not.toThrow();
  });
});

describe('renderGlScene2D', () => {
  it('does not throw for an empty display object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    prepareScene2DRender(state, obj);
    expect(() => renderGlScene2D(state, obj)).not.toThrow();
  });

  it('calls renderer.submit for a visible object with a renderer', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const obj = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, obj);
    prepareScene2DRender(state, obj);

    renderGlScene2D(state, obj);

    expect(renderer.submit).toHaveBeenCalledWith(state, data);
  });

  it('skips objects with zero alpha', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const obj = createDisplayObject();
    obj.alpha = 0;
    prepareScene2DRender(state, obj);

    renderGlScene2D(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('traverses children and draws visible ones', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(parent, child);
    prepareScene2DRender(state, parent);

    renderGlScene2D(state, parent);

    expect(renderer.submit).toHaveBeenCalledTimes(2);
  });
});
