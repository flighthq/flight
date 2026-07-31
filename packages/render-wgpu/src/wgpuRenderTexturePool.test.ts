import {
  explainWgpuRenderTexture,
  getWgpuRenderTextureTarget,
  isWgpuRenderTextureReady,
  writeWgpuRenderTextureTarget,
} from './wgpuRenderTexture';
import {
  acquireWgpuRenderTexture,
  createWgpuRenderTexturePool,
  destroyWgpuRenderTexturePool,
  releaseWgpuRenderTexture,
  withWgpuRenderTextures,
} from './wgpuRenderTexturePool';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => installWgpuMock());

describe('acquireWgpuRenderTexture', () => {
  it('reuses a released handle and reapplies dimensions before the next write', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const first = acquireWgpuRenderTexture(state, pool, { width: 32, height: 16 });
    writeWgpuRenderTextureTarget(state, first, () => {});
    releaseWgpuRenderTexture(state, pool, first);

    expect(explainWgpuRenderTexture(state, first).status).toBe('released');
    expect(isWgpuRenderTextureReady(state, first)).toBe(false);

    const second = acquireWgpuRenderTexture(state, pool, { width: 80, height: 48 });
    expect(second).toBe(first);
    expect(second.source.width).toBe(80);
    expect(second.source.height).toBe(48);
    expect(explainWgpuRenderTexture(state, second).status).toBe('unrendered');

    writeWgpuRenderTextureTarget(state, second, () => {});
    expect(explainWgpuRenderTexture(state, second)).toEqual({ width: 80, height: 48, status: 'ready' });
  });

  it('does not allow a pool to cross GPU devices', async () => {
    const a = await createWgpuRenderStateForTest();
    const b = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    acquireWgpuRenderTexture(a, pool, { width: 8, height: 8 });

    expect(() => acquireWgpuRenderTexture(b, pool, { width: 8, height: 8 })).toThrow('cannot cross GPU devices');
  });
});

describe('createWgpuRenderTexturePool', () => {
  it('creates an empty device-unbound pool', () => {
    const pool = createWgpuRenderTexturePool();
    expect(pool.device).toBeNull();
    expect(pool.destroyed).toBe(false);
    expect(pool.free).toEqual([]);
    expect(pool.leased.size).toBe(0);
  });
});

describe('destroyWgpuRenderTexturePool', () => {
  it('destroys hidden targets for free and outstanding leases', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const free = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const leased = acquireWgpuRenderTexture(state, pool, { width: 16, height: 16 });
    writeWgpuRenderTextureTarget(state, free, () => {});
    writeWgpuRenderTextureTarget(state, leased, () => {});
    const destroyFree = vi.spyOn(getWgpuRenderTextureTarget(state, free)!.texture, 'destroy');
    const destroyLeased = vi.spyOn(getWgpuRenderTextureTarget(state, leased)!.texture, 'destroy');
    releaseWgpuRenderTexture(state, pool, free);

    destroyWgpuRenderTexturePool(state, pool);

    expect(destroyFree).toHaveBeenCalledOnce();
    expect(destroyLeased).toHaveBeenCalledOnce();
    expect(pool.free).toHaveLength(0);
    expect(pool.leased.size).toBe(0);
  });

  it('rejects acquisition after destruction', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    destroyWgpuRenderTexturePool(state, pool);
    expect(() => acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 })).toThrow('has been destroyed');
  });
});

describe('releaseWgpuRenderTexture', () => {
  it('rejects a double release', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const texture = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    releaseWgpuRenderTexture(state, pool, texture);

    expect(() => releaseWgpuRenderTexture(state, pool, texture)).toThrow('texture is not leased');
  });
});

describe('withWgpuRenderTextures', () => {
  it('releases every lease when the bracket callback throws', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();

    expect(() =>
      withWgpuRenderTextures(
        state,
        pool,
        [
          { width: 8, height: 8 },
          { width: 8, height: 8 },
          { width: 8, height: 8 },
        ],
        () => {
          throw new Error('capture failed');
        },
      ),
    ).toThrow('capture failed');

    expect(pool.leased.size).toBe(0);
    expect(pool.free).toHaveLength(3);
  });
});
