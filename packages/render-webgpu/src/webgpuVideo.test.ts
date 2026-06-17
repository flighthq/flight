import { createVideo } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import { defaultWebGPUVideoRenderer, drawWebGPUVideo, drawWebGPUVideoMask } from './webgpuVideo';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUVideoRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultWebGPUVideoRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUVideoRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUVideo', () => {
  it('does not throw when video source is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const video = createVideo();
    prepareDisplayObjectRender(state, video);
    const renderProxy = getOrCreateRenderProxy2D(state, video);

    expect(() => drawWebGPUVideo(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const video = createVideo();
    prepareDisplayObjectRender(state, video);
    const renderProxy = getOrCreateRenderProxy2D(state, video);

    expect(() => drawWebGPUVideo(state, renderProxy)).not.toThrow();
  });
});

describe('drawWebGPUVideoMask', () => {
  it('delegates to drawWebGPUVideo', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const video = createVideo();
    prepareDisplayObjectRender(state, video);
    const renderProxy = getOrCreateRenderProxy2D(state, video);
    expect(() => drawWebGPUVideoMask(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
