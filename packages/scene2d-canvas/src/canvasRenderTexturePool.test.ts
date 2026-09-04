import { createCanvasOffscreenRenderState } from './canvasCache';
import {
  explainCanvasRenderTexture,
  getCanvasRenderTextureTarget,
  writeCanvasRenderTextureTarget,
} from './canvasRenderTexture';
import {
  acquireCanvasRenderTexture,
  createCanvasRenderTexturePool,
  destroyCanvasRenderTexturePool,
  initializeCanvasRenderTexturePool,
  releaseCanvasRenderTexture,
  withCanvasRenderTextures,
} from './canvasRenderTexturePool';
import {
  acquireTestCanvasRenderSurface,
  canvasTestSurfaceCreator,
  createCanvasRenderState,
  createCanvasRenderTarget,
  createCanvasTextureResolvers,
} from './canvasTestSupport';

describe('acquireCanvasRenderTexture', () => {
  it('reuses a released handle and applies current dimensions on every acquisition', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(state.surface.creator);
    const first = acquireCanvasRenderTexture(state, pool, { width: 32, height: 16 });
    writeCanvasRenderTextureTarget(state, first, () => {});
    releaseCanvasRenderTexture(state, pool, first);

    expect(explainCanvasRenderTexture(state, first).status).toBe('released');

    const second = acquireCanvasRenderTexture(state, pool, { width: 80, height: 48 });
    expect(second).toBe(first);
    expect(second.source.width).toBe(80);
    expect(second.source.height).toBe(48);
    expect(explainCanvasRenderTexture(state, second).status).toBe('unrendered');

    writeCanvasRenderTextureTarget(state, second, () => {});
    expect(explainCanvasRenderTexture(state, second)).toEqual({ width: 80, height: 48, status: 'ready' });
  });

  it('resets a released slab view before exposing the next logical target', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(state.surface.creator);
    const slabView = acquireCanvasRenderTexture(state, pool, { width: 720, height: 480 });
    slabView.flipX = true;
    slabView.flipY = true;
    slabView.uvOffset.x = 140 / 720;
    slabView.uvOffset.y = 160 / 480;
    slabView.uvRotation = Math.PI / 2;
    slabView.uvScale.x = 100 / 720;
    slabView.uvScale.y = 80 / 480;
    releaseCanvasRenderTexture(state, pool, slabView);

    const logicalTarget = acquireCanvasRenderTexture(state, pool, { width: 100, height: 80 });

    expect(logicalTarget).toBe(slabView);
    expect(logicalTarget).toMatchObject({
      flipX: false,
      flipY: false,
      uvOffset: { x: 0, y: 0 },
      uvRotation: 0,
      uvScale: { x: 1, y: 1 },
    });
  });

  it('requires the pool owner explicitly instead of resolving a hidden screen state', () => {
    const screen = createCanvasRenderState(document.createElement('canvas'));
    const offscreen = createCanvasOffscreenRenderState(
      acquireTestCanvasRenderSurface(),
      screen.pipeline,
      createCanvasTextureResolvers(),
    );
    const pool = createCanvasRenderTexturePool(screen.surface.creator);
    const texture = acquireCanvasRenderTexture(screen, pool, { width: 8, height: 8 });

    expect(() => acquireCanvasRenderTexture(offscreen, pool, { width: 8, height: 8 })).toThrow(
      'cannot cross screen render states',
    );
    writeCanvasRenderTextureTarget(screen, texture, () => {});
    expect(getCanvasRenderTextureTarget(screen, texture)).not.toBeNull();
    releaseCanvasRenderTexture(screen, pool, texture);
  });

  it('does not allow a pool to cross screen states', () => {
    const a = createCanvasRenderState(document.createElement('canvas'));
    const b = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(a.surface.creator);
    acquireCanvasRenderTexture(a, pool, { width: 8, height: 8 });

    expect(() => acquireCanvasRenderTexture(b, pool, { width: 8, height: 8 })).toThrow(
      'cannot cross screen render states',
    );
  });
});

describe('createCanvasRenderTexturePool', () => {
  it('creates an empty state-unbound pool', () => {
    const pool = createCanvasRenderTexturePool(canvasTestSurfaceCreator);
    expect(pool.owner).toBeNull();
    expect(pool.destroyed).toBe(false);
    expect(pool.free).toEqual([]);
    expect(pool.leased.size).toBe(0);
  });
});

describe('destroyCanvasRenderTexturePool', () => {
  it('collapses hidden and effect scratch canvases for free and outstanding leases', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(state.surface.creator);
    const free = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const leased = acquireCanvasRenderTexture(state, pool, { width: 16, height: 16 });
    writeCanvasRenderTextureTarget(state, free, () => {});
    writeCanvasRenderTextureTarget(state, leased, () => {});
    const freeCanvas = getCanvasRenderTextureTarget(state, free)!.canvas;
    const leasedCanvas = getCanvasRenderTextureTarget(state, leased)!.canvas;
    const effectScratch = createCanvasRenderTarget(24, 12);
    pool.effectTargets.free.push(effectScratch);
    releaseCanvasRenderTexture(state, pool, free);

    destroyCanvasRenderTexturePool(state, pool);

    expect(freeCanvas.width).toBe(0);
    expect(leasedCanvas.width).toBe(0);
    expect(effectScratch.canvas.width).toBe(0);
    expect(pool.free).toHaveLength(0);
    expect(pool.leased.size).toBe(0);
    expect(pool.owner).toBeNull();
  });

  it('rejects acquisition after destruction', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(state.surface.creator);
    destroyCanvasRenderTexturePool(state, pool);
    expect(() => acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 })).toThrow('has been destroyed');
  });
});

describe('initializeCanvasRenderTexturePool', () => {
  it('is the construction initializer of createCanvasRenderTexturePool', () => {
    expect(typeof initializeCanvasRenderTexturePool).toBe('function');
  });
});

describe('releaseCanvasRenderTexture', () => {
  it('rejects a double release', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(state.surface.creator);
    const texture = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    releaseCanvasRenderTexture(state, pool, texture);

    expect(() => releaseCanvasRenderTexture(state, pool, texture)).toThrow('texture is not leased');
  });
});
describe('withCanvasRenderTextures', () => {
  it('releases every lease when the bracket callback throws', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(state.surface.creator);

    expect(() =>
      withCanvasRenderTextures(
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
