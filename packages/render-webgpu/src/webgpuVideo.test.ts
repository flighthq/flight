import { createVideo } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode, prepareDisplayObjectRender } from '@flighthq/render';

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
    const renderNode = getOrCreateDisplayObjectRenderNode(state, video);

    expect(() => drawWebGPUVideo(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const video = createVideo();
    prepareDisplayObjectRender(state, video);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, video);

    expect(() => drawWebGPUVideo(state, renderNode)).not.toThrow();
  });
});

describe('drawWebGPUVideoMask', () => {
  it('delegates to drawWebGPUVideo', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const video = createVideo();
    prepareDisplayObjectRender(state, video);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, video);
    expect(() => drawWebGPUVideoMask(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
