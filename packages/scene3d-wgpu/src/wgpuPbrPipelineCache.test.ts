import type { WgpuPbrDefineKey } from '@flighthq/types';

import { compileWgpuPbrPipeline, ensureWgpuPbrPipeline } from './wgpuPbrPipelineCache';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

function key(overrides?: Partial<WgpuPbrDefineKey>): WgpuPbrDefineKey {
  return {
    alphaMaskEnabled: false,
    anisotropyEnabled: false,
    clearcoatEnabled: false,
    doubleSided: false,
    hasAlphaMap: false,
    hasBaseColorMap: false,
    hasEmissiveMap: false,
    hasMetallicRoughnessMap: false,
    hasNormalMap: false,
    hasOcclusionMap: false,
    iridescenceEnabled: false,
    sheenEnabled: false,
    specularEnabled: false,
    subsurfaceEnabled: false,
    transmissionEnabled: false,
    ...overrides,
  };
}

describe('compileWgpuPbrPipeline', () => {
  it('compiles a module and builds the pipeline + material bind-group layout', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = compileWgpuPbrPipeline(state, key(), 'rgba16float');
    expect(pipeline.pipeline).toBeDefined();
    expect(pipeline.materialBindGroupLayout).toBeDefined();
    expect(fake.calls.some((c) => c.name === 'createShaderModule')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
  });

  it('bakes back-face culling unless the key is doubleSided', () => {
    const { fake, state } = makeWgpuScene3DState();
    compileWgpuPbrPipeline(state, key(), 'bgra8unorm');
    compileWgpuPbrPipeline(state, key({ doubleSided: true }), 'bgra8unorm');
    const pipelineCalls = fake.calls.filter((c) => c.name === 'createRenderPipeline');
    const culled = pipelineCalls[0].args[0] as { primitive: { cullMode: string } };
    const doubleSided = pipelineCalls[1].args[0] as { primitive: { cullMode: string } };
    expect(culled.primitive.cullMode).toBe('back');
    expect(doubleSided.primitive.cullMode).toBe('none');
  });
});

describe('ensureWgpuPbrPipeline', () => {
  it('caches one pipeline per define key + format', () => {
    const { state } = makeWgpuScene3DState();
    const a = ensureWgpuPbrPipeline(state, key(), 'rgba16float');
    const b = ensureWgpuPbrPipeline(state, key(), 'rgba16float');
    expect(a).toBe(b);
    expect(getWgpuScene3DRuntime(state).pipelineCache.size).toBe(1);
  });

  it('compiles distinct variants for distinct format, standard, or extension defines', () => {
    const { state } = makeWgpuScene3DState();
    ensureWgpuPbrPipeline(state, key(), 'rgba16float');
    ensureWgpuPbrPipeline(state, key(), 'bgra8unorm');
    ensureWgpuPbrPipeline(state, key({ doubleSided: true }), 'rgba16float');
    ensureWgpuPbrPipeline(state, key({ clearcoatEnabled: true }), 'rgba16float');
    expect(getWgpuScene3DRuntime(state).pipelineCache.size).toBe(4);
  });
});
