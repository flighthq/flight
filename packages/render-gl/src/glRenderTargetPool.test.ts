import {
  acquireGlTextureRenderTarget,
  createGlTextureRenderTargetPool,
  destroyGlTextureRenderTargetPool,
  initializeGlTextureRenderTargetPool,
  releaseGlTextureRenderTarget,
} from './glRenderTargetPool';
import { createGlState } from './glTestHelper';

describe('acquireGlTextureRenderTarget', () => {
  it('allocates a new target when the pool is empty', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const target = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48 });
    expect(target.width).toBe(64);
    expect(target.height).toBe(48);
    expect(pool.free.length).toBe(0);
  });

  it('reuses a matching released target instead of allocating', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48 });
    releaseGlTextureRenderTarget(pool, first);

    const reused = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48 });
    expect(reused).toBe(first);
    expect(pool.free.length).toBe(0);
  });

  it('does not reuse a target with a different color space', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, colorSpace: 'linear' });
    expect(first.colorSpace).toBe('linear');
    releaseGlTextureRenderTarget(pool, first);

    const other = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, colorSpace: 'srgb' });
    expect(other).not.toBe(first);
    expect(pool.free).toContain(first);
  });

  it('does not reuse a target with different heterogeneous color formats', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, {
      width: 64,
      height: 48,
      colorAttachments: 2,
      colorFormats: ['rgba8', 'rgba8'],
    });
    releaseGlTextureRenderTarget(pool, first);

    const other = acquireGlTextureRenderTarget(state, pool, {
      width: 64,
      height: 48,
      colorAttachments: 2,
      colorFormats: ['rgba8', 'rgba16f'],
    });
    expect(other).not.toBe(first);
    expect(pool.free).toContain(first);
  });

  it('reuses the effective rgba8 target when a preferred float format is unsupported', () => {
    const { state, gl } = createGlState();
    vi.spyOn(gl, 'getExtension').mockReturnValue(null);
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, format: 'rgba8' });
    releaseGlTextureRenderTarget(pool, first);

    const reused = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, format: 'rgba32f' }, 'preferred');
    expect(reused).toBe(first);
    expect(reused.format).toBe('rgba8');
    expect(reused.requestedAxes.format).toBe('rgba32f');
    expect(reused.requestedAxes.colorFormats).toEqual(['rgba32f']);
  });

  it('refuses an unsupported required float format without consuming a fallback target', () => {
    const { state, gl } = createGlState();
    vi.spyOn(gl, 'getExtension').mockReturnValue(null);
    const pool = createGlTextureRenderTargetPool();
    const fallback = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, format: 'rgba8' });
    releaseGlTextureRenderTarget(pool, fallback);
    const createFramebufferSpy = vi.spyOn(gl, 'createFramebuffer');
    const clearSpy = vi.spyOn(gl, 'clear');
    createFramebufferSpy.mockClear();
    clearSpy.mockClear();

    const refused = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, format: 'rgba32f' }, 'required');
    expect(refused).toBeNull();
    expect(pool.free).toEqual([fallback]);
    expect(createFramebufferSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('allocates a supported required float format', () => {
    const { state, gl } = createGlState();
    vi.spyOn(gl, 'getExtension').mockReturnValue({} as never);
    const pool = createGlTextureRenderTargetPool();

    const target = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, format: 'rgba16f' }, 'required');
    expect(target).not.toBeNull();
    expect(target?.format).toBe('rgba16f');
    expect(target?.requestedAxes.format).toBe('rgba16f');
  });

  it('does not reuse a target with a different depth mode', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, depth: 'none' });
    releaseGlTextureRenderTarget(pool, first);

    const other = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48, depth: 'depth-stencil' });
    expect(other).not.toBe(first);
    expect(pool.free).toContain(first);
  });

  it('re-stamps requested axes on a compatible target', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, {
      width: 64,
      height: 48,
    });
    releaseGlTextureRenderTarget(pool, first);

    const reused = acquireGlTextureRenderTarget(state, pool, {
      width: 64,
      height: 48,
    });
    expect(reused).toBe(first);
    expect(reused.requestedAxes).toEqual({
      width: 64,
      height: 48,
      format: 'rgba8',
      colorAttachments: 1,
      colorFormats: ['rgba8'],
      sampleCount: 1,
      depth: 'none',
      colorSpace: 'srgb',
    });
  });

  it('allocates a new target when the free target has different dimensions', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48 });
    releaseGlTextureRenderTarget(pool, first);

    const other = acquireGlTextureRenderTarget(state, pool, { width: 128, height: 48 });
    expect(other).not.toBe(first);
    // The mismatched target stays parked in the free list.
    expect(pool.free).toContain(first);
  });

  it('matches the ceiled, clamped descriptor dimensions', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, { width: 10.2, height: 0 });
    releaseGlTextureRenderTarget(pool, first);

    // 10.2 -> 11, 0 -> 1; an equivalent descriptor must hit the same parked target.
    const reused = acquireGlTextureRenderTarget(state, pool, { width: 10.9, height: 0.4 });
    expect(reused).toBe(first);
  });

  it('clears a reused target so it is handed back clean', () => {
    const { state, gl } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const first = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48 });
    releaseGlTextureRenderTarget(pool, first);

    const clearSpy = vi.spyOn(gl, 'clearBufferfv');
    const reused = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 48 });
    expect(reused).toBe(first);
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe('createGlTextureRenderTargetPool', () => {
  it('returns a pool with an empty free list', () => {
    const pool = createGlTextureRenderTargetPool();
    expect(pool.free).toEqual([]);
  });
});

describe('destroyGlTextureRenderTargetPool', () => {
  it('destroys every parked target and empties the free list', () => {
    const { state, gl } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const a = acquireGlTextureRenderTarget(state, pool, { width: 32, height: 32 });
    const b = acquireGlTextureRenderTarget(state, pool, { width: 16, height: 16 });
    releaseGlTextureRenderTarget(pool, a);
    releaseGlTextureRenderTarget(pool, b);

    const deleteSpy = vi.spyOn(gl, 'deleteFramebuffer');
    destroyGlTextureRenderTargetPool(state, pool);

    expect(deleteSpy).toHaveBeenCalledWith(a.framebuffer);
    expect(deleteSpy).toHaveBeenCalledWith(b.framebuffer);
    expect(pool.free.length).toBe(0);
  });

  it('is a no-op on an empty pool', () => {
    const { state } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    expect(() => destroyGlTextureRenderTargetPool(state, pool)).not.toThrow();
  });
});

describe('initializeGlTextureRenderTargetPool', () => {
  it('is the construction initializer of createGlRenderTargetPool', () => {
    expect(typeof initializeGlTextureRenderTargetPool).toBe('function');
  });
});
describe('releaseGlTextureRenderTarget', () => {
  it('returns the target to the free list without destroying it', () => {
    const { state, gl } = createGlState();
    const pool = createGlTextureRenderTargetPool();
    const target = acquireGlTextureRenderTarget(state, pool, { width: 64, height: 64 });

    const deleteSpy = vi.spyOn(gl, 'deleteFramebuffer');
    releaseGlTextureRenderTarget(pool, target);

    expect(pool.free).toContain(target);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
