import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import {
  getWgpuRenderStats,
  recordWgpuBatchFlush,
  recordWgpuTextureUpload,
  resetWgpuRenderStats,
} from './wgpuRenderStats';

beforeAll(() => {
  installWgpuMock();
});

describe('getWgpuRenderStats', () => {
  it('returns zeroed stats for a fresh state', async () => {
    const state = await createWgpuRenderStateForTest();
    const stats = getWgpuRenderStats(state);
    expect(stats.drawCallCount).toBe(0);
    expect(stats.instanceCount).toBe(0);
    expect(stats.batchFlushCount).toBe(0);
    expect(stats.textureUploadCount).toBe(0);
  });

  it('returns the same object reference on repeated calls', async () => {
    const state = await createWgpuRenderStateForTest();
    const a = getWgpuRenderStats(state);
    const b = getWgpuRenderStats(state);
    expect(a).toBe(b);
  });
});

describe('recordWgpuBatchFlush', () => {
  it('increments draw call, instance, and batch flush counts', async () => {
    const state = await createWgpuRenderStateForTest();
    resetWgpuRenderStats(state);
    recordWgpuBatchFlush(state, 10);
    const stats = getWgpuRenderStats(state);
    expect(stats.drawCallCount).toBe(1);
    expect(stats.instanceCount).toBe(10);
    expect(stats.batchFlushCount).toBe(1);
  });

  it('accumulates across multiple flushes', async () => {
    const state = await createWgpuRenderStateForTest();
    resetWgpuRenderStats(state);
    recordWgpuBatchFlush(state, 5);
    recordWgpuBatchFlush(state, 3);
    const stats = getWgpuRenderStats(state);
    expect(stats.drawCallCount).toBe(2);
    expect(stats.instanceCount).toBe(8);
    expect(stats.batchFlushCount).toBe(2);
  });

  it('is a no-op when stats have not been initialized via getWgpuRenderStats or resetWgpuRenderStats', async () => {
    const state = await createWgpuRenderStateForTest();
    // Calling recordWgpuBatchFlush before getWgpuRenderStats / resetWgpuRenderStats should not throw.
    expect(() => recordWgpuBatchFlush(state, 10)).not.toThrow();
  });
});

describe('recordWgpuTextureUpload', () => {
  it('increments texture upload count', async () => {
    const state = await createWgpuRenderStateForTest();
    resetWgpuRenderStats(state);
    recordWgpuTextureUpload(state);
    recordWgpuTextureUpload(state);
    expect(getWgpuRenderStats(state).textureUploadCount).toBe(2);
  });

  it('is a no-op when stats have not been initialized', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(() => recordWgpuTextureUpload(state)).not.toThrow();
  });
});

describe('resetWgpuRenderStats', () => {
  it('zeroes all counts', async () => {
    const state = await createWgpuRenderStateForTest();
    resetWgpuRenderStats(state);
    recordWgpuBatchFlush(state, 100);
    recordWgpuTextureUpload(state);
    resetWgpuRenderStats(state);
    const stats = getWgpuRenderStats(state);
    expect(stats.drawCallCount).toBe(0);
    expect(stats.instanceCount).toBe(0);
    expect(stats.batchFlushCount).toBe(0);
    expect(stats.textureUploadCount).toBe(0);
  });
});
