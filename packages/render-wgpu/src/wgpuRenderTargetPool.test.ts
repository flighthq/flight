import {
  acquireWgpuTextureRenderTarget,
  createWgpuRenderTargetPool,
  destroyWgpuRenderTargetPool,
  initializeWgpuRenderTargetPool,
  releaseWgpuTextureRenderTarget,
} from './wgpuRenderTargetPool';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('acquireWgpuTextureRenderTarget', () => {
  it('reuses a released target matching width, height, and format', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    const first = acquireWgpuTextureRenderTarget(state, pool, { width: 64, height: 64 });
    releaseWgpuTextureRenderTarget(pool, first);
    const second = acquireWgpuTextureRenderTarget(state, pool, { width: 64, height: 64 });
    expect(second).toBe(first);
  });

  it('allocates a distinct target when no free target matches the format', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    const eight = acquireWgpuTextureRenderTarget(state, pool, { width: 64, height: 64 });
    releaseWgpuTextureRenderTarget(pool, eight);
    const hdr = acquireWgpuTextureRenderTarget(state, pool, { width: 64, height: 64, format: 'rgba16float' });
    expect(hdr).not.toBe(eight);
    expect(hdr.format).toBe('rgba16float');
  });

  it('realizes and pools a four-sample request at twice the extent in each axis', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    const supersampled = acquireWgpuTextureRenderTarget(state, pool, { width: 64, height: 48, sampleCount: 4 });
    expect(supersampled.width).toBe(128);
    expect(supersampled.height).toBe(96);
    expect(supersampled.sampleCount).toBe(4);

    releaseWgpuTextureRenderTarget(pool, supersampled);
    const singleSampled = acquireWgpuTextureRenderTarget(state, pool, { width: 128, height: 96 });
    expect(singleSampled).not.toBe(supersampled);

    const reused = acquireWgpuTextureRenderTarget(state, pool, { width: 64, height: 48, sampleCount: 4 });
    expect(reused).toBe(supersampled);
  });

  it('re-stamps the logical color space when reusing storage', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    const first = acquireWgpuTextureRenderTarget(state, pool, { width: 64, height: 64, colorSpace: 'linear' });
    expect(first.colorSpace).toBe('linear');
    releaseWgpuTextureRenderTarget(pool, first);
    const reused = acquireWgpuTextureRenderTarget(state, pool, { width: 64, height: 64 });
    expect(reused).toBe(first);
    expect(reused.colorSpace).toBe('srgb');
  });
});

describe('createWgpuRenderTargetPool', () => {
  it('starts with an empty free list', () => {
    expect(createWgpuRenderTargetPool().free).toEqual([]);
  });
});

describe('destroyWgpuRenderTargetPool', () => {
  it('clears the free list', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    releaseWgpuTextureRenderTarget(pool, acquireWgpuTextureRenderTarget(state, pool, { width: 32, height: 32 }));
    destroyWgpuRenderTargetPool(pool);
    expect(pool.free.length).toBe(0);
  });
});

describe('initializeWgpuRenderTargetPool', () => {
  it('is the construction initializer of createWgpuRenderTargetPool', () => {
    expect(typeof initializeWgpuRenderTargetPool).toBe('function');
  });
});
describe('releaseWgpuTextureRenderTarget', () => {
  it('returns the target to the free list', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    const target = acquireWgpuTextureRenderTarget(state, pool, { width: 16, height: 16 });
    releaseWgpuTextureRenderTarget(pool, target);
    expect(pool.free).toContain(target);
  });
});
