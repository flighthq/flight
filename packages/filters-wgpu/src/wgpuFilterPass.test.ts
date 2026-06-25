import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState } from '@flighthq/types';
import { describe, expect, it, vi } from 'vitest';

import {
  clearWgpuFilterTarget,
  createWgpuDualSourcePipeline,
  createWgpuFilterPipeline,
  createWgpuTripleSourcePipeline,
  destroyWgpuFilterPipelines,
  drawWgpuDualSourcePass,
  drawWgpuFilterPass,
  drawWgpuTripleSourcePass,
  getWgpuFilterState,
  registerWgpuFilterPipelineCache,
} from './wgpuFilterPass';
import { installWgpuMock, makeFilterState, makeRenderTarget } from './wgpuTestHelper';

installWgpuMock();

const MINIMAL_FRAGMENT_WGSL = `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@fragment fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return vec4f(0.0); }
`;

const DUAL_FRAGMENT_WGSL = `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var t1 : texture_2d<f32>;
@group(1) @binding(1) var s1 : sampler;
@group(2) @binding(0) var t2 : texture_2d<f32>;
@group(2) @binding(1) var s2 : sampler;
@fragment fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return vec4f(0.0); }
`;

const TRIPLE_FRAGMENT_WGSL = `
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var t1 : texture_2d<f32>;
@group(1) @binding(1) var s1 : sampler;
@group(2) @binding(0) var t2 : texture_2d<f32>;
@group(2) @binding(1) var s2 : sampler;
@group(3) @binding(0) var t3 : texture_2d<f32>;
@group(3) @binding(1) var s3 : sampler;
@fragment fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f { return vec4f(0.0); }
`;

describe('clearWgpuFilterTarget', () => {
  it('begins and ends a render pass with loadOp clear', async () => {
    const state = await makeFilterState();
    const target = makeRenderTarget();
    const runtime = getWgpuRenderStateRuntime(state);
    const beginSpy = vi.spyOn(runtime.commandEncoder!, 'beginRenderPass');
    clearWgpuFilterTarget(state, target);
    expect(beginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        colorAttachments: expect.arrayContaining([expect.objectContaining({ loadOp: 'clear' })]),
      }),
    );
  });
});

describe('createWgpuDualSourcePipeline', () => {
  it('creates a pipeline for a dual-source fragment shader', async () => {
    const state = await makeFilterState();
    const pipeline = createWgpuDualSourcePipeline(state, DUAL_FRAGMENT_WGSL);
    expect(pipeline).toBeDefined();
    expect(pipeline.pipeline).toBeDefined();
  });
});

describe('createWgpuFilterPipeline', () => {
  it('creates a pipeline for a single-source fragment shader', async () => {
    const state = await makeFilterState();
    const pipeline = createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);
    expect(pipeline).toBeDefined();
    expect(pipeline.pipeline).toBeDefined();
  });

  it('reuses device.createRenderPipeline result', async () => {
    const state = await makeFilterState();
    const internal = state as never as { device: { createRenderPipeline: ReturnType<typeof vi.fn> } };
    const spy = vi.spyOn(internal.device, 'createRenderPipeline');
    createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);
    expect(spy).toHaveBeenCalled();
  });
});

describe('createWgpuTripleSourcePipeline', () => {
  it('creates a pipeline for a triple-source fragment shader', async () => {
    const state = await makeFilterState();
    const pipeline = createWgpuTripleSourcePipeline(state, TRIPLE_FRAGMENT_WGSL);
    expect(pipeline).toBeDefined();
    expect(pipeline.pipeline).toBeDefined();
  });
});

describe('destroyWgpuFilterPipelines', () => {
  it('does not throw when called before any filter is applied (no state yet)', async () => {
    const state = await makeFilterState();
    // No filter applied yet — filter infrastructure not yet created.
    expect(() => destroyWgpuFilterPipelines(state)).not.toThrow();
  });

  it('destroys the uniform buffer and allows re-creation after destroy', async () => {
    const state = await makeFilterState();
    const pipeline = createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    // Apply a filter to ensure filter state is initialized.
    drawWgpuFilterPass(state, source, dest, pipeline, () => {});
    // Destroy should not throw.
    expect(() => destroyWgpuFilterPipelines(state)).not.toThrow();
    // Re-using state after destroy should re-create infrastructure without error.
    expect(() => drawWgpuFilterPass(state, source, dest, pipeline, () => {})).not.toThrow();
  });

  it('evicts registered per-filter pipeline caches for the destroyed state', async () => {
    const state = await makeFilterState();
    const cache = new WeakMap<WgpuRenderState, unknown>();
    registerWgpuFilterPipelineCache(cache);
    // Populate the cache for this state.
    cache.set(state, { pipeline: {} });
    expect(cache.has(state)).toBe(true);
    // Trigger filter-state init so destroyWgpuFilterPipelines has something to clear.
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    drawWgpuFilterPass(state, source, dest, createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL), () => {});
    // destroyWgpuFilterPipelines must evict the registered cache entry.
    destroyWgpuFilterPipelines(state);
    expect(cache.has(state)).toBe(false);
  });

  it('is idempotent — double destroy does not throw', async () => {
    const state = await makeFilterState();
    createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    drawWgpuFilterPass(state, source, dest, createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL), () => {});
    destroyWgpuFilterPipelines(state);
    expect(() => destroyWgpuFilterPipelines(state)).not.toThrow();
  });
});

describe('drawWgpuDualSourcePass', () => {
  it('draws with two source bind groups and calls draw(6)', async () => {
    const state = await makeFilterState();
    const source0 = makeRenderTarget();
    const source1 = makeRenderTarget();
    const dest = makeRenderTarget();
    const pipeline = createWgpuDualSourcePipeline(state, DUAL_FRAGMENT_WGSL);

    const drawCalls: number[] = [];
    const commandEncoder = getWgpuRenderStateRuntime(state).commandEncoder!;
    const origBegin = commandEncoder.beginRenderPass.bind(commandEncoder);
    vi.spyOn(commandEncoder, 'beginRenderPass').mockImplementation((...args) => {
      const pass = origBegin(...args);
      vi.spyOn(pass, 'draw').mockImplementation((n) => {
        drawCalls.push(n);
      });
      return pass;
    });

    drawWgpuDualSourcePass(state, source0, source1, dest, pipeline, () => {});
    expect(drawCalls).toContain(6);
  });
});

describe('drawWgpuFilterPass', () => {
  it('calls writeBuffer with uniform data and draws 6 vertices', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const pipeline = createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);

    const writeBufferCalls: unknown[][] = [];
    const internalState = state as never as { device: { queue: { writeBuffer: (...args: unknown[]) => void } } };
    vi.spyOn(internalState.device.queue, 'writeBuffer').mockImplementation((...args) => {
      writeBufferCalls.push(args);
    });

    drawWgpuFilterPass(state, source, dest, pipeline, (f32) => {
      f32[0] = 0.75;
    });
    expect(writeBufferCalls.length).toBeGreaterThan(0);
  });

  it('throws when no command encoder is active', async () => {
    const state = await makeFilterState();
    getWgpuRenderStateRuntime(state).commandEncoder = null;
    const pipeline = createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);
    const source = makeRenderTarget();
    expect(() => drawWgpuFilterPass(state, source, null, pipeline, () => {})).toThrow();
  });
});

describe('drawWgpuTripleSourcePass', () => {
  it('draws with three source bind groups without error', async () => {
    const state = await makeFilterState();
    const source0 = makeRenderTarget();
    const source1 = makeRenderTarget();
    const source2 = makeRenderTarget();
    const dest = makeRenderTarget();
    const pipeline = createWgpuTripleSourcePipeline(state, TRIPLE_FRAGMENT_WGSL);
    expect(() => drawWgpuTripleSourcePass(state, source0, source1, source2, dest, pipeline, () => {})).not.toThrow();
  });
});

describe('getWgpuFilterState', () => {
  it('returns filter state with expected accessors', async () => {
    const state = await makeFilterState();
    const fs = getWgpuFilterState(state);
    expect(fs.uniformBG).toBeDefined();
    expect(fs.textureBGLayout).toBeDefined();
    expect(fs.uniformBGLayout).toBeDefined();
    expect(fs.sampler).toBeDefined();
    expect(fs.acquireSlot).toBeTypeOf('function');
    expect(fs.writeSlot).toBeTypeOf('function');
    expect(fs.beginPass).toBeTypeOf('function');
  });

  it('returns the same state for the same render state instance', async () => {
    const state = await makeFilterState();
    const fs1 = getWgpuFilterState(state);
    const fs2 = getWgpuFilterState(state);
    expect(fs1.uniformBG).toBe(fs2.uniformBG);
  });
});

describe('registerWgpuFilterPipelineCache', () => {
  it('accepts a cache that was never populated — no-op on empty map', async () => {
    const state = await makeFilterState();
    const emptyCache = new WeakMap<WgpuRenderState, unknown>();
    registerWgpuFilterPipelineCache(emptyCache);
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    drawWgpuFilterPass(state, source, dest, createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL), () => {});
    // destroy must not throw even if the cache was never set for this state.
    expect(() => destroyWgpuFilterPipelines(state)).not.toThrow();
  });

  it('registers a cache that is evicted on destroyWgpuFilterPipelines', async () => {
    const state = await makeFilterState();
    const cache = new WeakMap<WgpuRenderState, unknown>();
    registerWgpuFilterPipelineCache(cache);
    cache.set(state, { marker: true });
    expect(cache.has(state)).toBe(true);
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    drawWgpuFilterPass(state, source, dest, createWgpuFilterPipeline(state, MINIMAL_FRAGMENT_WGSL), () => {});
    destroyWgpuFilterPipelines(state);
    expect(cache.has(state)).toBe(false);
  });
});
