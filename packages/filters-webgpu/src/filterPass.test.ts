import { getWebGPURenderStateRuntime } from '@flighthq/render-webgpu';
import { describe, expect, it, vi } from 'vitest';

import {
  clearWebGPUFilterTarget,
  createWebGPUDualSourcePipeline,
  createWebGPUFilterPipeline,
  createWebGPUTripleSourcePipeline,
  drawWebGPUDualSourcePass,
  drawWebGPUFilterPass,
  drawWebGPUTripleSourcePass,
  getWebGPUFilterState,
} from './filterPass';
import { installWebGPUMock, makeFilterState, makeRenderTarget } from './testHelper';

installWebGPUMock();

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

describe('clearWebGPUFilterTarget', () => {
  it('begins and ends a render pass with loadOp clear', async () => {
    const state = await makeFilterState();
    const target = makeRenderTarget();
    const runtime = getWebGPURenderStateRuntime(state);
    const beginSpy = vi.spyOn(runtime.commandEncoder!, 'beginRenderPass');
    clearWebGPUFilterTarget(state, target);
    expect(beginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        colorAttachments: expect.arrayContaining([expect.objectContaining({ loadOp: 'clear' })]),
      }),
    );
  });
});

describe('createWebGPUDualSourcePipeline', () => {
  it('creates a pipeline for a dual-source fragment shader', async () => {
    const state = await makeFilterState();
    const pipeline = createWebGPUDualSourcePipeline(state, DUAL_FRAGMENT_WGSL);
    expect(pipeline).toBeDefined();
    expect(pipeline.pipeline).toBeDefined();
  });
});

describe('createWebGPUFilterPipeline', () => {
  it('creates a pipeline for a single-source fragment shader', async () => {
    const state = await makeFilterState();
    const pipeline = createWebGPUFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);
    expect(pipeline).toBeDefined();
    expect(pipeline.pipeline).toBeDefined();
  });

  it('reuses device.createRenderPipeline result', async () => {
    const state = await makeFilterState();
    const internal = state as never as { device: { createRenderPipeline: ReturnType<typeof vi.fn> } };
    const spy = vi.spyOn(internal.device, 'createRenderPipeline');
    createWebGPUFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);
    expect(spy).toHaveBeenCalled();
  });
});

describe('createWebGPUTripleSourcePipeline', () => {
  it('creates a pipeline for a triple-source fragment shader', async () => {
    const state = await makeFilterState();
    const pipeline = createWebGPUTripleSourcePipeline(state, TRIPLE_FRAGMENT_WGSL);
    expect(pipeline).toBeDefined();
    expect(pipeline.pipeline).toBeDefined();
  });
});

describe('drawWebGPUDualSourcePass', () => {
  it('draws with two source bind groups and calls draw(6)', async () => {
    const state = await makeFilterState();
    const source0 = makeRenderTarget();
    const source1 = makeRenderTarget();
    const dest = makeRenderTarget();
    const pipeline = createWebGPUDualSourcePipeline(state, DUAL_FRAGMENT_WGSL);

    const drawCalls: number[] = [];
    const commandEncoder = getWebGPURenderStateRuntime(state).commandEncoder!;
    const origBegin = commandEncoder.beginRenderPass.bind(commandEncoder);
    vi.spyOn(commandEncoder, 'beginRenderPass').mockImplementation((...args) => {
      const pass = origBegin(...args);
      vi.spyOn(pass, 'draw').mockImplementation((n) => {
        drawCalls.push(n);
      });
      return pass;
    });

    drawWebGPUDualSourcePass(state, source0, source1, dest, pipeline, () => {});
    expect(drawCalls).toContain(6);
  });
});

describe('drawWebGPUFilterPass', () => {
  it('calls writeBuffer with uniform data and draws 6 vertices', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const pipeline = createWebGPUFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);

    const writeBufferCalls: unknown[][] = [];
    const internalState = state as never as { device: { queue: { writeBuffer: (...args: unknown[]) => void } } };
    vi.spyOn(internalState.device.queue, 'writeBuffer').mockImplementation((...args) => {
      writeBufferCalls.push(args);
    });

    drawWebGPUFilterPass(state, source, dest, pipeline, (f32) => {
      f32[0] = 0.75;
    });
    expect(writeBufferCalls.length).toBeGreaterThan(0);
  });

  it('throws when no command encoder is active', async () => {
    const state = await makeFilterState();
    getWebGPURenderStateRuntime(state).commandEncoder = null;
    const pipeline = createWebGPUFilterPipeline(state, MINIMAL_FRAGMENT_WGSL);
    const source = makeRenderTarget();
    expect(() => drawWebGPUFilterPass(state, source, null, pipeline, () => {})).toThrow();
  });
});

describe('drawWebGPUTripleSourcePass', () => {
  it('draws with three source bind groups without error', async () => {
    const state = await makeFilterState();
    const source0 = makeRenderTarget();
    const source1 = makeRenderTarget();
    const source2 = makeRenderTarget();
    const dest = makeRenderTarget();
    const pipeline = createWebGPUTripleSourcePipeline(state, TRIPLE_FRAGMENT_WGSL);
    expect(() => drawWebGPUTripleSourcePass(state, source0, source1, source2, dest, pipeline, () => {})).not.toThrow();
  });
});

describe('getWebGPUFilterState', () => {
  it('returns filter state with expected accessors', async () => {
    const state = await makeFilterState();
    const fs = getWebGPUFilterState(state);
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
    const fs1 = getWebGPUFilterState(state);
    const fs2 = getWebGPUFilterState(state);
    expect(fs1.uniformBG).toBe(fs2.uniformBG);
  });
});
