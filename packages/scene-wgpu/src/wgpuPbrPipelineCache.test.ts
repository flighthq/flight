import { compileWgpuPbrPipeline, ensureWgpuPbrPipeline } from './wgpuPbrPipelineCache';
import type { WgpuPbrDefineKey } from './wgpuPbrPrelude';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function key(overrides?: Partial<WgpuPbrDefineKey>): WgpuPbrDefineKey {
  return {
    alphaMaskEnabled: false,
    doubleSided: false,
    hasBaseColorMap: false,
    hasNormalMap: false,
    ...overrides,
  };
}

describe('compileWgpuPbrPipeline', () => {
  it('compiles a module and builds the pipeline + bind-group layouts', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuPbrPipeline(state, key(), 'rgba16float');
    expect(pipeline.pipeline).toBeDefined();
    expect(pipeline.frameBindGroupLayout).toBeDefined();
    expect(pipeline.materialBindGroupLayout).toBeDefined();
    expect(fake.calls.some((c) => c.name === 'createShaderModule')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'createRenderPipeline')).toBe(true);
  });

  it('bakes back-face culling unless the key is doubleSided', () => {
    const { fake, state } = makeWgpuSceneState();
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
    const { state } = makeWgpuSceneState();
    const a = ensureWgpuPbrPipeline(state, key(), 'rgba16float');
    const b = ensureWgpuPbrPipeline(state, key(), 'rgba16float');
    expect(a).toBe(b);
    expect(getWgpuSceneRuntime(state).pipelineCache.size).toBe(1);
  });

  it('compiles distinct variants for distinct format or defines', () => {
    const { state } = makeWgpuSceneState();
    ensureWgpuPbrPipeline(state, key(), 'rgba16float');
    ensureWgpuPbrPipeline(state, key(), 'bgra8unorm');
    ensureWgpuPbrPipeline(state, key({ doubleSided: true }), 'rgba16float');
    expect(getWgpuSceneRuntime(state).pipelineCache.size).toBe(3);
  });
});
