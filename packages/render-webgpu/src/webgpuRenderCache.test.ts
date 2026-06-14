import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode, prepareDisplayObjectRender } from '@flighthq/render';

import type { WebGPURenderStateInternal } from './internal';
import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import {
  defaultWebGPURenderImageCacheMaskRenderer,
  defaultWebGPURenderImageCacheRenderer,
  drawWebGPUImageCacheResult,
  enableWebGPURenderImageCache,
} from './webgpuRenderCache';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPURenderImageCacheMaskRenderer', () => {
  it('has a drawMask function', () => {
    expect(typeof defaultWebGPURenderImageCacheMaskRenderer.drawMask).toBe('function');
  });
});

describe('defaultWebGPURenderImageCacheRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPURenderImageCacheRenderer.createData).toBe('function');
    expect(typeof defaultWebGPURenderImageCacheRenderer.draw).toBe('function');
  });
});

describe('drawWebGPUImageCacheResult', () => {
  it('does not throw when cache source is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);
    const fakeCache = { source: null, transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } } as never;
    expect(() => drawWebGPUImageCacheResult(state, renderNode, fakeCache)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('enableWebGPURenderImageCache', () => {
  it('registers the image cache renderer on the state', async () => {
    const state = await createWebGPURenderStateForTest();
    enableWebGPURenderImageCache(state);
    // ImageRenderCache registers a renderer for a specific kind
    expect(state.rendererMap.size).toBeGreaterThan(0);
  });
});
