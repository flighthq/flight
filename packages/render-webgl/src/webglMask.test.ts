import { registerDisplayObjectMaskRenderer } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { addSceneChild } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { DisplayObjectKind } from '@flighthq/types';

import { drawWebGLMask, enableWebGLMaskSupport, popWebGLMask, pushWebGLMask } from './webglMask';
import { makeWebGLState } from './webglTestHelper';

function makeRenderer() {
  return {
    createData: () => null,
    draw: vi.fn(),
    drawMask: vi.fn(),
  };
}

describe('drawWebGLMask', () => {
  it('calls drawMask on the renderer when present', () => {
    const { state } = makeWebGLState();
    const source = createDisplayObject();
    const renderer = makeRenderer();
    registerDisplayObjectMaskRenderer(state, DisplayObjectKind, renderer);
    const data = getOrCreateDisplayObjectRenderNode(state, source);

    drawWebGLMask(state, data);

    expect(renderer.drawMask).toHaveBeenCalledWith(state, data);
  });

  it('applies child masks recursively', () => {
    const { state } = makeWebGLState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    const renderer = makeRenderer();
    registerDisplayObjectMaskRenderer(state, DisplayObjectKind, renderer);
    addSceneChild(parent, child);
    const parentData = getOrCreateDisplayObjectRenderNode(state, parent);
    const childData = getOrCreateDisplayObjectRenderNode(state, child);

    drawWebGLMask(state, parentData);

    expect(renderer.drawMask).toHaveBeenCalledWith(state, childData);
  });
});

describe('enableWebGLMaskSupport', () => {
  it('sets WebGL mask hooks on the render state', () => {
    const { state } = makeWebGLState();

    enableWebGLMaskSupport(state);

    expect(state.displayObjectMaskHooks).not.toBeNull();
  });
});

describe('popWebGLMask', () => {
  it('disables stencil testing when the last mask is popped', () => {
    const { state, gl } = makeWebGLState();
    state.currentMaskDepth = 1;

    popWebGLMask(state, {} as any);

    expect(state.currentMaskDepth).toBe(0);
    expect(gl.disable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    expect(gl.stencilMask).toHaveBeenLastCalledWith(0xff);
  });
});

describe('pushWebGLMask', () => {
  it('draws the mask into stencil and configures stencil testing', () => {
    const { state, gl } = makeWebGLState();
    const source = createDisplayObject();
    const renderer = makeRenderer();
    registerDisplayObjectMaskRenderer(state, DisplayObjectKind, renderer);
    const data = getOrCreateDisplayObjectRenderNode(state, source);

    pushWebGLMask(state, data);

    expect(gl.enable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    expect(gl.clear).toHaveBeenCalledWith(gl.STENCIL_BUFFER_BIT);
    expect(gl.colorMask).toHaveBeenNthCalledWith(1, false, false, false, false);
    expect(renderer.drawMask).toHaveBeenCalledWith(state, data);
    expect(gl.colorMask).toHaveBeenLastCalledWith(true, true, true, true);
    expect(gl.stencilFunc).toHaveBeenLastCalledWith(gl.EQUAL, 1, 0xff);
    expect(state.currentMaskDepth).toBe(1);
  });
});
