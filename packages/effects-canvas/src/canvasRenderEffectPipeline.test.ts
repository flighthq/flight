import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasRenderEffectRunner, RenderEffect } from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { canvasTestSurfaceCreator, createCanvasRenderState } from './canvasEffectTestSupport';
import {
  acquireCanvasRenderTarget,
  beginCanvasRenderEffectPipeline,
  createCanvasRenderEffectPipeline,
  createCanvasRenderTargetPool,
  destroyCanvasRenderEffectPipeline,
  endCanvasRenderEffectPipeline,
  releaseCanvasRenderTarget,
} from './canvasRenderEffectPipeline';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

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
    const pool = createCanvasRenderTargetPool(canvasTestSurfaceCreator);
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

  it('writes an unregistered effect destination before chaining and presenting it', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const state = createCanvasRenderState(canvas);
    const pipeline = createCanvasRenderEffectPipeline(state);
    beginCanvasRenderEffectPipeline(state, pipeline);
    const scene = pipeline.sceneTarget!;
    scene.context.fillStyle = '#ff0000';
    scene.context.fillRect(0, 0, 4, 4);

    const realizedRunner = vi.fn<CanvasRenderEffectRunner>((ctx) => {
      drawCanvasEffectPass(ctx.dest, ctx.source, 'none');
    });
    registerCanvasRenderEffect(state, 'RealizedEffect', realizedRunner);

    endCanvasRenderEffectPipeline(state, pipeline, [
      (() => { const out = allocateEntity<unknown>(); out.kind = 'UnregisteredEffect'; return finishEntity(out); })(),
      (() => { const out = allocateEntity<unknown>(); out.kind = 'RealizedEffect'; return finishEntity(out); })(),
    ] as RenderEffect[]);

    const [unregisteredDest, realizedDest] = pipeline.pool.free;
    expect(unregisteredDest).toBeDefined();
    expect(realizedDest).toBeDefined();
    expect(unregisteredDest!.context.drawImage).toHaveBeenCalledWith(scene.canvas, 0, 0);
    expect(realizedRunner).toHaveBeenCalledWith(
      expect.objectContaining({ source: unregisteredDest, dest: realizedDest }),
      expect.objectContaining({ kind: 'RealizedEffect' }),
    );
    expect(realizedDest!.context.drawImage).toHaveBeenCalledWith(unregisteredDest!.canvas, 0, 0);
    expect(state.context.drawImage).toHaveBeenCalledWith(realizedDest!.canvas, 0, 0);
  });
});

describe('releaseCanvasRenderTarget', () => {
  it('is a function', () => {
    expect(typeof releaseCanvasRenderTarget).toBe('function');
  });

  it('moves an acquired target back to the free list', () => {
    const pool = createCanvasRenderTargetPool(canvasTestSurfaceCreator);
    const target = acquireCanvasRenderTarget(pool, 16, 16);
    expect(pool.inUse).toContain(target);
    releaseCanvasRenderTarget(pool, target);
    expect(pool.inUse).not.toContain(target);
    expect(pool.free).toContain(target);
  });
});
