import {
  acquireCanvasRenderTarget,
  beginCanvasRenderEffectPipeline,
  createCanvasRenderEffectPipeline,
  createCanvasRenderTargetPool,
  destroyCanvasRenderEffectPipeline,
  endCanvasRenderEffectPipeline,
  releaseCanvasRenderTarget,
} from './canvasRenderEffectPipeline';

describe('acquireCanvasRenderTarget', () => {
  it('is a function', () => {
    expect(typeof acquireCanvasRenderTarget).toBe('function');
  });
});

describe('beginCanvasRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof beginCanvasRenderEffectPipeline).toBe('function');
  });
});

describe('createCanvasRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof createCanvasRenderEffectPipeline).toBe('function');
  });
});

describe('createCanvasRenderTargetPool', () => {
  it('is a function', () => {
    expect(typeof createCanvasRenderTargetPool).toBe('function');
  });

  it('returns a pool with empty free and inUse lists', () => {
    const pool = createCanvasRenderTargetPool();
    expect(pool.free).toEqual([]);
    expect(pool.inUse).toEqual([]);
  });
});

describe('destroyCanvasRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof destroyCanvasRenderEffectPipeline).toBe('function');
  });
});

describe('endCanvasRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof endCanvasRenderEffectPipeline).toBe('function');
  });
});

describe('releaseCanvasRenderTarget', () => {
  it('is a function', () => {
    expect(typeof releaseCanvasRenderTarget).toBe('function');
  });

  it('moves an acquired target back to the free list', () => {
    const pool = createCanvasRenderTargetPool();
    const target = acquireCanvasRenderTarget(pool, 16, 16);
    expect(pool.inUse).toContain(target);
    releaseCanvasRenderTarget(pool, target);
    expect(pool.inUse).not.toContain(target);
    expect(pool.free).toContain(target);
  });
});
