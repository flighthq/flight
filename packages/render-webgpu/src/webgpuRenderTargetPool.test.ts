import {
  acquireWebGPURenderTarget,
  createWebGPURenderTargetPool,
  destroyWebGPURenderTargetPool,
  releaseWebGPURenderTarget,
} from './webgpuRenderTargetPool';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('acquireWebGPURenderTarget', () => {
  it('reuses a released target matching width, height, and format', async () => {
    const state = await createWebGPURenderStateForTest();
    const pool = createWebGPURenderTargetPool();
    const first = acquireWebGPURenderTarget(state, pool, { width: 64, height: 64 });
    releaseWebGPURenderTarget(pool, first);
    const second = acquireWebGPURenderTarget(state, pool, { width: 64, height: 64 });
    expect(second).toBe(first);
  });

  it('allocates a distinct target when no free target matches the format', async () => {
    const state = await createWebGPURenderStateForTest();
    const pool = createWebGPURenderTargetPool();
    const eight = acquireWebGPURenderTarget(state, pool, { width: 64, height: 64 });
    releaseWebGPURenderTarget(pool, eight);
    const hdr = acquireWebGPURenderTarget(state, pool, { width: 64, height: 64, format: 'rgba16float' });
    expect(hdr).not.toBe(eight);
    expect(hdr.format).toBe('rgba16float');
  });
});

describe('createWebGPURenderTargetPool', () => {
  it('starts with an empty free list', () => {
    expect(createWebGPURenderTargetPool().free).toEqual([]);
  });
});

describe('destroyWebGPURenderTargetPool', () => {
  it('clears the free list', async () => {
    const state = await createWebGPURenderStateForTest();
    const pool = createWebGPURenderTargetPool();
    releaseWebGPURenderTarget(pool, acquireWebGPURenderTarget(state, pool, { width: 32, height: 32 }));
    destroyWebGPURenderTargetPool(state, pool);
    expect(pool.free.length).toBe(0);
  });
});

describe('releaseWebGPURenderTarget', () => {
  it('returns the target to the free list', async () => {
    const state = await createWebGPURenderStateForTest();
    const pool = createWebGPURenderTargetPool();
    const target = acquireWebGPURenderTarget(state, pool, { width: 16, height: 16 });
    releaseWebGPURenderTarget(pool, target);
    expect(pool.free).toContain(target);
  });
});
