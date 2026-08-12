import { addNodeChild } from '@flighthq/node/contract';
import { createGlRenderState } from '@flighthq/render-gl/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { GlRenderState } from '@flighthq/types/contract';
import { DisplayObjectKind } from '@flighthq/types/contract';

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
  it('establishes cull and depth state rather than inheriting it from a previous 3D pass', () => {
    const state = makeState();
    const gl = state.gl;
    // Real WebGL2 confirms the consequence this guards: Flight's 2D quad is wound (x0,y0)(x1,y0)(x1,y1)
    // in a y-down space that the projection flips, so it is a BACK face under the CCW default. Drawing
    // it with CULL_FACE left enabled by the 3D mesh path erases 2D content entirely — 2304 lit pixels
    // become 0. Depth testing is the same class: a stale 3D depth buffer rejects 2D fragments.
    const enabled = new Set<number>([gl.CULL_FACE, gl.DEPTH_TEST]);
    (gl.isEnabled as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabled.has(cap));
    (gl.enable as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabled.add(cap));
    (gl.disable as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabled.delete(cap));

    renderGlScene2D(state, createDisplayObject());

    expect(enabled.has(gl.CULL_FACE)).toBe(false);
    expect(enabled.has(gl.DEPTH_TEST)).toBe(false);
  });

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
