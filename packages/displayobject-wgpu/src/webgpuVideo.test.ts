import { createVideo } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { createWgpuVideoData, defaultWgpuVideoRenderer, destroyWgpuVideoData, drawWgpuVideo } from './webgpuVideo';

beforeAll(() => {
  installWgpuMock();
});

describe('createWgpuVideoData', () => {
  it('allocates per-node data with no texture entry yet', () => {
    const data = createWgpuVideoData({} as never, {} as never) as unknown as { entry: unknown };
    expect(data.entry).toBeNull();
  });
});

describe('defaultWgpuVideoRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultWgpuVideoRenderer.createData).toBe('function');
    expect(typeof defaultWgpuVideoRenderer.submit).toBe('function');
  });
});

describe('destroyWgpuVideoData', () => {
  it('destroys the GPU texture the node owns', () => {
    const destroy = vi.fn();
    destroyWgpuVideoData({} as never, { entry: { texture: { destroy } } } as never);
    expect(destroy).toHaveBeenCalled();
  });

  it('is a no-op when no texture entry was allocated', () => {
    expect(() => destroyWgpuVideoData({} as never, { entry: null } as never)).not.toThrow();
  });
});

describe('drawWgpuVideo', () => {
  it('does not throw when video source is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const video = createVideo();
    prepareDisplayObjectRender(state, video);
    const renderProxy = getOrCreateRenderProxy2D(state, video);

    expect(() => drawWgpuVideo(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const video = createVideo();
    prepareDisplayObjectRender(state, video);
    const renderProxy = getOrCreateRenderProxy2D(state, video);

    expect(() => drawWgpuVideo(state, renderProxy)).not.toThrow();
  });
});
