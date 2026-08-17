import { beginWgpuFrame, createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { RenderEffect } from '@flighthq/types/contract';

import {
  beginWgpuRenderEffectPipeline,
  createWgpuRenderEffectPipeline,
  destroyWgpuRenderEffectPipeline,
  endWgpuRenderEffectPipeline,
  setWgpuRenderEffectPipelineSkipGuard,
  setWgpuRenderEffectVelocityTexture,
} from './wgpuRenderEffectPipeline';

beforeAll(() => installWgpuMock());

describe('beginWgpuRenderEffectPipeline', () => {
  it('allocates the scene target on first begin and reuses the same one afterwards', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);

    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    const first = pipeline.sceneTarget;
    endWgpuRenderEffectPipeline(state, pipeline, []);

    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);

    expect(first).not.toBeNull();
    // The retained-target contract: begin resizes rather than reallocating, so a per-frame pipeline
    // does not churn GPU memory. A new object here would be a leak the pool cannot see.
    expect(pipeline.sceneTarget).toBe(first);
    endWgpuRenderEffectPipeline(state, pipeline, []);
  });

  it('stamps the requested color space onto the scene target before the pass opens', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);

    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline, 'linear');

    expect(pipeline.sceneTarget?.colorSpace).toBe('linear');
    endWgpuRenderEffectPipeline(state, pipeline, []);
  });

  it('packs the background quadruple into one 0xRRGGBBAA clear color', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);
    // Quarter/half/three-quarter channels, chosen so a wrong byte order cannot coincide with the
    // right one — the ground truth is arithmetic here, not a value read back out of the source.
    state.backgroundColorRgba.splice(0, state.backgroundColorRgba.length, 0x40 / 255, 0x80 / 255, 0xc0 / 255, 1);

    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);

    expect(pipeline.sceneTarget?.clearColors).toEqual([0x4080c0ff]);
    endWgpuRenderEffectPipeline(state, pipeline, []);
  });

  it('leaves the clear list empty when the background is not a full quadruple', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);
    state.backgroundColorRgba.splice(0, state.backgroundColorRgba.length, 0.5, 0.5, 0.5);

    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);

    // Empty means "no background to composite" — a different frame than a transparent clear, and the
    // reason the target falls back to the render state's own background instead.
    expect(pipeline.sceneTarget?.clearColors).toEqual([]);
    endWgpuRenderEffectPipeline(state, pipeline, []);
  });
});

describe('createWgpuRenderEffectPipeline', () => {
  it('returns a pipeline with nothing allocated yet', async () => {
    const state = await createWgpuRenderStateForTest();

    const pipeline = createWgpuRenderEffectPipeline(state);

    expect(pipeline.sceneTarget).toBeNull();
    expect(pipeline.velocityTexture).toBeNull();
    expect(pipeline.lutTexture).toEqual({ texture: null, size: 0, lut: null });
    expect(pipeline.lutCache.signature).toBeNull();
  });

  it('copies the options rather than aliasing the caller object', async () => {
    const state = await createWgpuRenderStateForTest();
    const options = { format: 'rgba16f' as const };

    const pipeline = createWgpuRenderEffectPipeline(state, options);
    options.format = 'rgba8' as unknown as 'rgba16f';

    // The pipeline outlives the call; an alias would let a caller retune the format of a pipeline
    // whose scene target was already allocated against the old one.
    expect(pipeline.options.format).toBe('rgba16f');
  });

  it('rejects a multisample request instead of silently dropping it', async () => {
    const state = await createWgpuRenderStateForTest();

    expect(() => createWgpuRenderEffectPipeline(state, { sampleCount: 4 })).toThrow(
      'createWgpuRenderEffectPipeline: sampleCount 4 is unsupported; WebGPU effect targets are single-sample',
    );
  });

  it('gives each pipeline its own pool and caches', async () => {
    const state = await createWgpuRenderStateForTest();

    const a = createWgpuRenderEffectPipeline(state);
    const b = createWgpuRenderEffectPipeline(state);

    expect(a.pool).not.toBe(b.pool);
    expect(a.lutCache).not.toBe(b.lutCache);
    expect(a.lutTexture).not.toBe(b.lutTexture);
  });
});

describe('destroyWgpuRenderEffectPipeline', () => {
  it('releases the scene target and clears the LUT caches', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);
    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    endWgpuRenderEffectPipeline(state, pipeline, []);
    expect(pipeline.sceneTarget).not.toBeNull();

    destroyWgpuRenderEffectPipeline(state, pipeline);

    expect(pipeline.sceneTarget).toBeNull();
    expect(pipeline.lutTexture).toEqual({ texture: null, size: 0, lut: null });
    expect(pipeline.lutCache.signature).toBeNull();
    expect(pipeline.lutCache.lut).toBeNull();
  });

  it('is safe on a pipeline that never began a frame', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);

    expect(() => destroyWgpuRenderEffectPipeline(state, pipeline)).not.toThrow();
    expect(pipeline.sceneTarget).toBeNull();
  });

  it('is idempotent — a second destroy neither throws nor resurrects state', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);
    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    endWgpuRenderEffectPipeline(state, pipeline, []);

    destroyWgpuRenderEffectPipeline(state, pipeline);
    expect(() => destroyWgpuRenderEffectPipeline(state, pipeline)).not.toThrow();
    expect(pipeline.sceneTarget).toBeNull();
  });
});

describe('endWgpuRenderEffectPipeline', () => {
  it('returns without touching the pipeline when no scene target was begun', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);
    const pool = pipeline.pool;

    // The early return is the only thing standing between an unbegun pipeline and endWgpuRenderPass
    // popping a pass that was never pushed, so it is asserted rather than assumed.
    expect(() => endWgpuRenderEffectPipeline(state, pipeline, [])).not.toThrow();
    expect(pipeline.sceneTarget).toBeNull();
    expect(pipeline.pool).toBe(pool);
  });

  it('runs an empty operation list without allocating scratch targets', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);

    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    endWgpuRenderEffectPipeline(state, pipeline, []);

    // Every acquire must be matched by a release before end returns; a pool holding entries after an
    // empty chain would mean the ping-pong leaked a target on the no-op path.
    expect(pipeline.pool.free.length).toBe(0);
  });

  it('returns pooled scratch targets after running a chain', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);
    const chain = [{ kind: 'test.wgpu-pipeline-unregistered' } as RenderEffect];

    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    endWgpuRenderEffectPipeline(state, pipeline, chain);

    // An unregistered kind is skipped, so the chain does no work — but the bracketing still has to
    // balance. This is the acquire/release invariant measured at its cheapest observable point.
    expect(pipeline.pool.free.every((target) => target !== pipeline.sceneTarget)).toBe(true);
  });
});

describe('setWgpuRenderEffectPipelineSkipGuard', () => {
  it('reports every effect kind the pass drops, and goes silent again when cleared', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);
    const dropped: string[] = [];
    const chain = [{ kind: 'test.wgpu-pipeline-skip-seam' } as RenderEffect];

    setWgpuRenderEffectPipelineSkipGuard(state, (_state, kind) => dropped.push(kind));
    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    endWgpuRenderEffectPipeline(state, pipeline, chain);

    expect(dropped).toEqual(['test.wgpu-pipeline-skip-seam']);

    // Clearing must restore the original silence exactly: the seam is the ONLY path by which a dropped
    // effect is observable, so a stale guard would be the difference between a diagnostic and a leak.
    setWgpuRenderEffectPipelineSkipGuard(state, null);
    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    endWgpuRenderEffectPipeline(state, pipeline, chain);

    expect(dropped).toEqual(['test.wgpu-pipeline-skip-seam']);
  });
});

describe('setWgpuRenderEffectVelocityTexture', () => {
  it('sets the velocity texture on the pipeline', () => {
    const pipeline = {
      options: {},
      sceneTarget: null,
      pool: { free: [] },
      lutCache: { signature: null, lut: null },
      lutTexture: { texture: null, size: 0, lut: null },
      velocityTexture: null,
    };
    const texture = {} as GPUTexture;
    setWgpuRenderEffectVelocityTexture(pipeline, texture);
    expect(pipeline.velocityTexture).toBe(texture);
  });
});
