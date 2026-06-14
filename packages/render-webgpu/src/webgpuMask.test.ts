import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode, prepareDisplayObjectRender } from '@flighthq/render';

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
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);
    expect(() => drawWebGPUMask(internal, renderNode)).not.toThrow();
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
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);

    pushWebGPUMask(internal, renderNode);
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
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);

    expect(internal.currentMaskDepth).toBe(0);
    pushWebGPUMask(internal, renderNode);
    expect(internal.currentMaskDepth).toBe(1);
    submitWebGPURenderPass(state);
  });
});
