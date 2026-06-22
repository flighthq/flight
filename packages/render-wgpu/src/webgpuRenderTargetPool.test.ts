import {
  acquireWgpuRenderTarget,
  createWgpuRenderTargetPool,
  destroyWgpuRenderTargetPool,
  releaseWgpuRenderTarget,
} from './webgpuRenderTargetPool';
import { createWgpuRenderStateForTest, installWgpuMock } from './webgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('acquireWgpuRenderTarget', () => {
  it('reuses a released target matching width, height, and format', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    const first = acquireWgpuRenderTarget(state, pool, { width: 64, height: 64 });
    releaseWgpuRenderTarget(pool, first);
    const second = acquireWgpuRenderTarget(state, pool, { width: 64, height: 64 });
    expect(second).toBe(first);
  });

  it('allocates a distinct target when no free target matches the format', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    const eight = acquireWgpuRenderTarget(state, pool, { width: 64, height: 64 });
    releaseWgpuRenderTarget(pool, eight);
    const hdr = acquireWgpuRenderTarget(state, pool, { width: 64, height: 64, format: 'rgba16float' });
    expect(hdr).not.toBe(eight);
    expect(hdr.format).toBe('rgba16float');
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
    releaseWgpuRenderTarget(pool, acquireWgpuRenderTarget(state, pool, { width: 32, height: 32 }));
    destroyWgpuRenderTargetPool(state, pool);
    expect(pool.free.length).toBe(0);
  });
});

describe('releaseWgpuRenderTarget', () => {
  it('returns the target to the free list', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTargetPool();
    const target = acquireWgpuRenderTarget(state, pool, { width: 16, height: 16 });
    releaseWgpuRenderTarget(pool, target);
    expect(pool.free).toContain(target);
  });
});
