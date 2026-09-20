import { createColorLutCache } from '@flighthq/adjustments/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  beginWgpuScreenRenderPassForTest,
  createWgpuRenderStateForTest,
  endWgpuRenderPass,
  installWgpuMock,
} from '@flighthq/render-wgpu/contract';
import type { RenderEffect } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';
import {
  beginWgpuEffectPass,
  createWgpuEffectState,
  destroyWgpuEffectState,
  endWgpuEffectPass,
  initializeWgpuEffectState,
  setWgpuEffectStateSampleCountGuard,
  setWgpuEffectStateSkipGuard,
  setWgpuEffectVelocityTexture,
} from './wgpuEffectState';

beforeAll(() => installWgpuMock());

describe('beginWgpuEffectPass', () => {
  it('allocates the scene target on first begin and reuses the same one afterwards', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);

    const screenPass = beginWgpuScreenRenderPassForTest(state);
    endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, []);
    const first = pipeline.sceneTarget;
    endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, []);

    expect(first).not.toBeNull();
    // The retained-target contract: begin resizes rather than reallocating, so a per-frame pipeline
    // does not churn GPU memory. A new object here would be a leak the pool cannot see.
    expect(pipeline.sceneTarget).toBe(first);
    endWgpuRenderPass(screenPass);
  });

  it('stamps the requested color space onto the scene target before the pass opens', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);

    const screenPass = beginWgpuScreenRenderPassForTest(state);
    const scenePass = beginWgpuEffectPass(screenPass, pipeline, undefined, 'linear');

    expect(pipeline.sceneTarget?.colorSpace).toBe('linear');
    endWgpuEffectPass(scenePass, pipeline, []);
    endWgpuRenderPass(screenPass);
  });

  // ★ THE CLEAR IS AN ARGUMENT, NOT A STATE PROPERTY. The scene target used to be cleared to
  // state.backgroundColorRgba, which meant "what the frame is cleared to" was a value the render state
  // carried around and every caller shared. It is per-pass data and now arrives as one.
  it('clears the scene target to the colour it is given', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);
    const screenPass = beginWgpuScreenRenderPassForTest(state);
    const { getWgpuRenderStateRuntime } = await import('@flighthq/render-wgpu/contract');
    const beginRenderPass = vi.spyOn(getWgpuRenderStateRuntime(state).commandEncoder!, 'beginRenderPass');

    const scenePass = beginWgpuEffectPass(screenPass, pipeline, {
      color: [0x40 / 255, 0x80 / 255, 0xc0 / 255, 1],
      depth: 1.0,
    });

    const attachment = Array.from(beginRenderPass.mock.calls.at(-1)![0].colorAttachments)[0]!;
    const clearValue = attachment.clearValue as GPUColorDict;
    expect(clearValue.r).toBeCloseTo(0x40 / 255);
    expect(clearValue.g).toBeCloseTo(0x80 / 255);
    expect(clearValue.b).toBeCloseTo(0xc0 / 255);
    expect(clearValue.a).toBe(1);
    endWgpuEffectPass(scenePass, pipeline, []);
    endWgpuRenderPass(screenPass);
  });

  it('clears to transparent black when the caller names no colour', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);
    const screenPass = beginWgpuScreenRenderPassForTest(state);
    const { getWgpuRenderStateRuntime } = await import('@flighthq/render-wgpu/contract');
    const beginRenderPass = vi.spyOn(getWgpuRenderStateRuntime(state).commandEncoder!, 'beginRenderPass');

    const scenePass = beginWgpuEffectPass(screenPass, pipeline);

    const attachment = Array.from(beginRenderPass.mock.calls.at(-1)![0].colorAttachments)[0]!;
    const clearValue = attachment.clearValue as GPUColorDict;
    expect([clearValue.r, clearValue.g, clearValue.b, clearValue.a]).toEqual([0, 0, 0, 0]);
    endWgpuEffectPass(scenePass, pipeline, []);
    endWgpuRenderPass(screenPass);
  });

  it('realizes a four-sample scene target at twice the canvas extent', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state, { sampleCount: 4 });

    const screenPass = beginWgpuScreenRenderPassForTest(state);
    const scenePass = beginWgpuEffectPass(screenPass, pipeline);

    expect(pipeline.sceneTarget?.width).toBe(screenPass.viewport.width * 2);
    expect(pipeline.sceneTarget?.height).toBe(screenPass.viewport.height * 2);
    expect(pipeline.sceneTarget?.sampleCount).toBe(4);
    endWgpuEffectPass(scenePass, pipeline, []);
    endWgpuRenderPass(screenPass);
  });
});

describe('createWgpuEffectState', () => {
  it('returns a pipeline with nothing allocated yet', async () => {
    const state = await createWgpuRenderStateForTest();

    const pipeline = createWgpuEffectState(state);

    expect(pipeline.sceneTarget).toBeNull();
    expect(pipeline.velocityTexture).toBeNull();
    expect(pipeline.lutTexture).toEqual({ texture: null, size: 0, lut: null });
    expect(pipeline.lutCache.signature).toBeNull();
  });

  it('copies the options rather than aliasing the caller object', async () => {
    const state = await createWgpuRenderStateForTest();
    const options = { format: 'rgba16f' as const };

    const pipeline = createWgpuEffectState(state, options);
    options.format = 'rgba8' as unknown as 'rgba16f';

    // The pipeline outlives the call; an alias would let a caller retune the format of a pipeline
    // whose scene target was already allocated against the old one.
    expect(pipeline.options.format).toBe('rgba16f');
  });

  it('retains the supported four-sample request', async () => {
    const state = await createWgpuRenderStateForTest();

    const pipeline = createWgpuEffectState(state, { sampleCount: 4 });

    expect(pipeline.options.sampleCount).toBe(4);
  });

  describe('setWgpuEffectStateSampleCountGuard', () => {
    it('reports the requested and applied sample counts through the optional diagnostics seam', async () => {
      const state = await createWgpuRenderStateForTest();
      const substitutions: Array<[number, number]> = [];
      setWgpuEffectStateSampleCountGuard(state, (_state, requested, applied) => {
        substitutions.push([requested, applied]);
      });

      createWgpuEffectState(state, { sampleCount: 2 });
      expect(substitutions).toEqual([[2, 4]]);

      setWgpuEffectStateSampleCountGuard(state, null);
      createWgpuEffectState(state, { sampleCount: 8 });
      expect(substitutions).toEqual([[2, 4]]);
    });
  });

  it('gives each pipeline its own pool and caches', async () => {
    const state = await createWgpuRenderStateForTest();

    const a = createWgpuEffectState(state);
    const b = createWgpuEffectState(state);

    expect(a.pool).not.toBe(b.pool);
    expect(a.lutCache).not.toBe(b.lutCache);
    expect(a.lutTexture).not.toBe(b.lutTexture);
  });
});

describe('destroyWgpuEffectState', () => {
  it('releases the scene target and clears the LUT caches', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);
    const screenPass = beginWgpuScreenRenderPassForTest(state);
    endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, []);
    endWgpuRenderPass(screenPass);
    expect(pipeline.sceneTarget).not.toBeNull();

    destroyWgpuEffectState(state, pipeline);

    expect(pipeline.sceneTarget).toBeNull();
    expect(pipeline.lutTexture).toEqual({ texture: null, size: 0, lut: null });
    expect(pipeline.lutCache.signature).toBeNull();
    expect(pipeline.lutCache.lut).toBeNull();
  });

  it('is safe on a pipeline that never began a frame', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);

    expect(() => destroyWgpuEffectState(state, pipeline)).not.toThrow();
    expect(pipeline.sceneTarget).toBeNull();
  });

  it('is idempotent — a second destroy neither throws nor resurrects state', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);
    const screenPass = beginWgpuScreenRenderPassForTest(state);
    endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, []);
    endWgpuRenderPass(screenPass);

    destroyWgpuEffectState(state, pipeline);
    expect(() => destroyWgpuEffectState(state, pipeline)).not.toThrow();
    expect(pipeline.sceneTarget).toBeNull();
  });
});

describe('endWgpuEffectPass', () => {
  it('returns without touching the pipeline when no scene target was begun', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);
    const pool = pipeline.pool;

    // The early return is the only thing standing between an unbegun pipeline and endWgpuRenderPass
    // closing a pass the pipeline never opened, so it is asserted rather than assumed.
    const screenPass = beginWgpuScreenRenderPassForTest(state);
    expect(() => endWgpuEffectPass(screenPass, pipeline, [])).not.toThrow();
    endWgpuRenderPass(screenPass);
    expect(pipeline.sceneTarget).toBeNull();
    expect(pipeline.pool).toBe(pool);
  });

  // ★ THE PRESENT OVERWRITES, IT DOES NOT COMPOSITE. The scene target already holds the finished frame, so
  // compositing it over the enclosing attachment lets that attachment's CLEAR show through wherever the
  // frame's own alpha is zero. A fixed-function Darken (MIN with ONE/ONE) drives a zero-coverage pixel to
  // (0,0,0,0) by design, and under a premultiplied present the black it had just computed came back as the
  // enclosing clear — material-blend-modes read 16 for a 0x10 clear and 64 for a 0x40 clear, tracking the
  // clear exactly while WebGL wrote black.
  //
  // dstFactor 'zero' is the whole property: it makes the destination — and therefore the clear — unable to
  // contribute to the presented pixel at any alpha. Asserting the factors rather than a rendered pixel is
  // what lets this run on the mock device, and it fails the moment the call site opts back into 'premul'.
  it('presents with a blend the enclosing clear cannot contribute to', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);

    const screenPass = beginWgpuScreenRenderPassForTest(state);
    endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, []);
    endWgpuRenderPass(screenPass);

    const present = getWgpuEffectPipeline(state, 'effect.present', '') as unknown as {
      pipeline: { __descriptor: GPURenderPipelineDescriptor };
    };
    const [target] = [...present.pipeline.__descriptor.fragment!.targets];
    const blend = target!.blend!;

    expect(blend.color.dstFactor).toBe('zero');
    expect(blend.alpha.dstFactor).toBe('zero');
  });

  it('runs an empty operation list without allocating scratch targets', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);

    const screenPass = beginWgpuScreenRenderPassForTest(state);
    endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, []);
    endWgpuRenderPass(screenPass);

    // Every acquire must be matched by a release before end returns; a pool holding entries after an
    // empty chain would mean the ping-pong leaked a target on the no-op path.
    expect(pipeline.pool.free.length).toBe(0);
  });

  it('presents the final result with replace blend so transparent pixels overwrite the screen clear', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state, { format: 'rgba16f' });
    const createRenderPipeline = vi.spyOn(state.device, 'createRenderPipeline');

    const screenPass = beginWgpuScreenRenderPassForTest(state);
    const scenePass = beginWgpuEffectPass(screenPass, pipeline, undefined, 'linear');
    endWgpuEffectPass(scenePass, pipeline, []);

    const presentCall = createRenderPipeline.mock.calls.at(-1)![0] as GPURenderPipelineDescriptor;
    const blend = (presentCall.fragment!.targets as GPUColorTargetState[])[0].blend!;
    expect(blend.color.srcFactor).toBe('one');
    expect(blend.color.dstFactor).toBe('zero');
    expect(blend.alpha.srcFactor).toBe('one');
    expect(blend.alpha.dstFactor).toBe('zero');
    endWgpuRenderPass(screenPass);
  });

  it('returns pooled scratch targets after running a chain', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);
    const chain = [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.wgpu-pipeline-unregistered';
        return finishEntity(out);
      })() as RenderEffect,
    ];

    const screenPass = beginWgpuScreenRenderPassForTest(state);
    endWgpuEffectPass(beginWgpuEffectPass(screenPass, pipeline), pipeline, chain);
    endWgpuRenderPass(screenPass);

    // An unregistered kind is skipped, so the chain does no work — but the bracketing still has to
    // balance. This is the acquire/release invariant measured at its cheapest observable point.
    expect(pipeline.pool.free.every((target) => target !== pipeline.sceneTarget)).toBe(true);
  });
});

describe('initializeWgpuEffectState', () => {
  it('is the construction initializer of createWgpuEffectState', () => {
    expect(typeof initializeWgpuEffectState).toBe('function');
  });
});

describe('setWgpuEffectStateSkipGuard', () => {
  it('reports every effect kind the pass drops, and goes silent again when cleared', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuEffectState(state);
    const dropped: string[] = [];
    const chain = [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.wgpu-pipeline-skip-seam';
        return finishEntity(out);
      })() as RenderEffect,
    ];

    setWgpuEffectStateSkipGuard(state, (_state, kind) => dropped.push(kind));
    const guarded = beginWgpuScreenRenderPassForTest(state);
    endWgpuEffectPass(beginWgpuEffectPass(guarded, pipeline), pipeline, chain);
    endWgpuRenderPass(guarded);

    expect(dropped).toEqual(['test.wgpu-pipeline-skip-seam']);

    // Clearing must restore the original silence exactly: the seam is the ONLY path by which a dropped
    // effect is observable, so a stale guard would be the difference between a diagnostic and a leak.
    setWgpuEffectStateSkipGuard(state, null);
    const silent = beginWgpuScreenRenderPassForTest(state);
    endWgpuEffectPass(beginWgpuEffectPass(silent, pipeline), pipeline, chain);
    endWgpuRenderPass(silent);

    expect(dropped).toEqual(['test.wgpu-pipeline-skip-seam']);
  });
});
describe('setWgpuEffectVelocityTexture', () => {
  it('sets the velocity texture on the pipeline', () => {
    const _pipeline = allocateEntity<any>();
    _pipeline.options = {};
    _pipeline.sceneTarget = null;
    _pipeline.pool = { [EntityRuntimeKey]: undefined, free: [] };
    _pipeline.lutCache = createColorLutCache();
    _pipeline.lutTexture = { texture: null, size: 0, lut: null };
    _pipeline.velocityTexture = null;
    const pipeline = finishEntity(_pipeline);
    const texture = {} as GPUTexture;
    setWgpuEffectVelocityTexture(pipeline, texture);
    expect(pipeline.velocityTexture).toBe(texture);
  });
});
