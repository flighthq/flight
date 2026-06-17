import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';

import type { WebGPURenderStateInternal } from './internal';
import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { drawWebGPUMask, popWebGPUMask, pushWebGPUMask } from './webgpuMask';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('drawWebGPUMask', () => {
  it('does not throw for a render node with no mask renderer registered', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);
    expect(() => drawWebGPUMask(internal, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('popWebGPUMask', () => {
  it('decrements currentMaskDepth', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;

    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    pushWebGPUMask(internal, renderProxy);
    popWebGPUMask(internal);
    expect(internal.currentMaskDepth).toBe(0);
    submitWebGPURenderPass(state);
  });

  it('does not go below zero', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as unknown as WebGPURenderStateInternal;
    popWebGPUMask(internal);
    expect(internal.currentMaskDepth).toBe(0);
  });
});

describe('pushWebGPUMask', () => {
  it('increments currentMaskDepth', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;

    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    expect(internal.currentMaskDepth).toBe(0);
    pushWebGPUMask(internal, renderProxy);
    expect(internal.currentMaskDepth).toBe(1);
    submitWebGPURenderPass(state);
  });
});
