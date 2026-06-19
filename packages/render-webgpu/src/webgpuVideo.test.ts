import { createVideo } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import {
  createWebGPUVideoData,
  defaultWebGPUVideoRenderer,
  destroyWebGPUVideoData,
  drawWebGPUVideo,
} from './webgpuVideo';

beforeAll(() => {
  installWebGPUMock();
});

describe('createWebGPUVideoData', () => {
  it('allocates per-node data with no texture entry yet', () => {
    const data = createWebGPUVideoData({} as never, {} as never) as unknown as { entry: unknown };
    expect(data.entry).toBeNull();
  });
});

describe('defaultWebGPUVideoRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultWebGPUVideoRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUVideoRenderer.submit).toBe('function');
  });
});

describe('destroyWebGPUVideoData', () => {
  it('destroys the GPU texture the node owns', () => {
    const destroy = vi.fn();
    destroyWebGPUVideoData({} as never, { entry: { texture: { destroy } } } as never);
    expect(destroy).toHaveBeenCalled();
  });

  it('is a no-op when no texture entry was allocated', () => {
    expect(() => destroyWebGPUVideoData({} as never, { entry: null } as never)).not.toThrow();
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
