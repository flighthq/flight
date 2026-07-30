import { explainGlRenderTexture, isGlRenderTextureReady, writeGlRenderTextureTarget } from './glRenderTexture';
import {
  acquireGlRenderTexture,
  createGlRenderTexturePool,
  destroyGlRenderTexturePool,
  releaseGlRenderTexture,
  withGlRenderTextures,
} from './glRenderTexturePool';
import { createGlState } from './glTestHelper';

describe('acquireGlRenderTexture', () => {
  it('reuses a released handle and applies current dimensions on every acquisition', () => {
    const { state } = createGlState();
    const pool = createGlRenderTexturePool();
    const first = acquireGlRenderTexture(state, pool, { width: 32, height: 16 });
    writeGlRenderTextureTarget(state, first, () => {});
    releaseGlRenderTexture(state, pool, first);

    expect(explainGlRenderTexture(state, first).status).toBe('released');
    expect(isGlRenderTextureReady(state, first)).toBe(false);

    const second = acquireGlRenderTexture(state, pool, { width: 80, height: 48 });
    expect(second).toBe(first);
    expect(second.source.width).toBe(80);
    expect(second.source.height).toBe(48);
    expect(explainGlRenderTexture(state, second).status).toBe('unrendered');

    writeGlRenderTextureTarget(state, second, () => {});
    expect(explainGlRenderTexture(state, second)).toEqual({ width: 80, height: 48, status: 'ready' });
  });

  it('does not allow a pool to cross WebGL contexts', () => {
    const a = createGlState();
    const b = createGlState();
    const pool = createGlRenderTexturePool();
    acquireGlRenderTexture(a.state, pool, { width: 8, height: 8 });

    expect(() => acquireGlRenderTexture(b.state, pool, { width: 8, height: 8 })).toThrow('cannot cross WebGL contexts');
  });
});

describe('createGlRenderTexturePool', () => {
  it('creates an empty usable pool', () => {
    const pool = createGlRenderTexturePool();
    expect(pool.context).toBeNull();
    expect(pool.destroyed).toBe(false);
    expect(pool.free).toEqual([]);
    expect(pool.leased.size).toBe(0);
  });
});

describe('destroyGlRenderTexturePool', () => {
  it('destroys hidden targets for both free and outstanding leases at shutdown', () => {
    const { state, gl } = createGlState();
    const pool = createGlRenderTexturePool();
    const free = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const leased = acquireGlRenderTexture(state, pool, { width: 16, height: 16 });
    writeGlRenderTextureTarget(state, free, () => {});
    writeGlRenderTextureTarget(state, leased, () => {});
    releaseGlRenderTexture(state, pool, free);
    const deletes = vi.mocked(gl.deleteTexture).mock.calls.length;

    destroyGlRenderTexturePool(state, pool);

    expect(gl.deleteTexture).toHaveBeenCalledTimes(deletes + 2);
    expect(pool.free).toHaveLength(0);
    expect(pool.leased.size).toBe(0);
  });

  it('rejects acquisition after destruction', () => {
    const { state } = createGlState();
    const pool = createGlRenderTexturePool();
    destroyGlRenderTexturePool(state, pool);
    expect(() => acquireGlRenderTexture(state, pool, { width: 8, height: 8 })).toThrow('has been destroyed');
  });
});

describe('releaseGlRenderTexture', () => {
  it('rejects a double release', () => {
    const { state } = createGlState();
    const pool = createGlRenderTexturePool();
    const texture = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    releaseGlRenderTexture(state, pool, texture);

    expect(() => releaseGlRenderTexture(state, pool, texture)).toThrow('texture is not leased');
  });
});

describe('withGlRenderTextures', () => {
  it('releases every lease when the bracket callback throws', () => {
    const { state } = createGlState();
    const pool = createGlRenderTexturePool();

    expect(() =>
      withGlRenderTextures(
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
