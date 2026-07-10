import {
  acquireGlRenderTarget,
  createGlRenderTargetPool,
  destroyGlRenderTargetPool,
  releaseGlRenderTarget,
} from './glRenderTargetPool';
import { createGlState } from './glTestHelper';

describe('acquireGlRenderTarget', () => {
  it('allocates a new target when the pool is empty', () => {
    const { state } = createGlState();
    const pool = createGlRenderTargetPool();
    const target = acquireGlRenderTarget(state, pool, { width: 64, height: 48 });
    expect(target.width).toBe(64);
    expect(target.height).toBe(48);
    expect(pool.free.length).toBe(0);
  });

  it('reuses a matching released target instead of allocating', () => {
    const { state } = createGlState();
    const pool = createGlRenderTargetPool();
    const first = acquireGlRenderTarget(state, pool, { width: 64, height: 48 });
    releaseGlRenderTarget(pool, first);

    const reused = acquireGlRenderTarget(state, pool, { width: 64, height: 48 });
    expect(reused).toBe(first);
    expect(pool.free.length).toBe(0);
  });

  it('allocates a new target when the free target has different dimensions', () => {
    const { state } = createGlState();
    const pool = createGlRenderTargetPool();
    const first = acquireGlRenderTarget(state, pool, { width: 64, height: 48 });
    releaseGlRenderTarget(pool, first);

    const other = acquireGlRenderTarget(state, pool, { width: 128, height: 48 });
    expect(other).not.toBe(first);
    // The mismatched target stays parked in the free list.
    expect(pool.free).toContain(first);
  });

  it('matches the ceiled, clamped descriptor dimensions', () => {
    const { state } = createGlState();
    const pool = createGlRenderTargetPool();
    const first = acquireGlRenderTarget(state, pool, { width: 10.2, height: 0 });
    releaseGlRenderTarget(pool, first);

    // 10.2 -> 11, 0 -> 1; an equivalent descriptor must hit the same parked target.
    const reused = acquireGlRenderTarget(state, pool, { width: 10.9, height: 0.4 });
    expect(reused).toBe(first);
  });

  it('clears a reused target so it is handed back clean', () => {
    const { state, gl } = createGlState();
    const pool = createGlRenderTargetPool();
    const first = acquireGlRenderTarget(state, pool, { width: 64, height: 48 });
    releaseGlRenderTarget(pool, first);

    // Only the reuse path clears — spy after the first (fresh) acquire so we measure just the reuse.
    const clearSpy = vi.spyOn(gl, 'clear');
    const reused = acquireGlRenderTarget(state, pool, { width: 64, height: 48 });
    expect(reused).toBe(first);
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe('createGlRenderTargetPool', () => {
  it('returns a pool with an empty free list', () => {
    const pool = createGlRenderTargetPool();
    expect(pool.free).toEqual([]);
  });
});

describe('destroyGlRenderTargetPool', () => {
  it('destroys every parked target and empties the free list', () => {
    const { state, gl } = createGlState();
    const pool = createGlRenderTargetPool();
    const a = acquireGlRenderTarget(state, pool, { width: 32, height: 32 });
    const b = acquireGlRenderTarget(state, pool, { width: 16, height: 16 });
    releaseGlRenderTarget(pool, a);
    releaseGlRenderTarget(pool, b);

    const deleteSpy = vi.spyOn(gl, 'deleteFramebuffer');
    destroyGlRenderTargetPool(state, pool);

    expect(deleteSpy).toHaveBeenCalledWith(a.framebuffer);
    expect(deleteSpy).toHaveBeenCalledWith(b.framebuffer);
    expect(pool.free.length).toBe(0);
  });

  it('is a no-op on an empty pool', () => {
    const { state } = createGlState();
    const pool = createGlRenderTargetPool();
    expect(() => destroyGlRenderTargetPool(state, pool)).not.toThrow();
  });
});

describe('releaseGlRenderTarget', () => {
  it('returns the target to the free list without destroying it', () => {
    const { state, gl } = createGlState();
    const pool = createGlRenderTargetPool();
    const target = acquireGlRenderTarget(state, pool, { width: 64, height: 64 });

    const deleteSpy = vi.spyOn(gl, 'deleteFramebuffer');
    releaseGlRenderTarget(pool, target);

    expect(pool.free).toContain(target);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
