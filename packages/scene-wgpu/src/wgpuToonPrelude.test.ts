import type { LinearColor, WgpuToonDefineKey } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';
import {
  bindWgpuToonSurface,
  buildWgpuToonDefineKey,
  compileWgpuToonPipeline,
  ensureWgpuToonPipeline,
  getWgpuToonModuleSourceForKey,
} from './wgpuToonPrelude';

const FLAT: WgpuToonDefineKey = { alphaMaskEnabled: false, doubleSided: false, hasBaseColorMap: false, hasRamp: false };
const COLOR: LinearColor = [0.5, 0.25, 0.1, 1];

describe('bindWgpuToonSurface', () => {
  it('creates a material bind group once per key and writes its uniform', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuToonPipeline(state, FLAT, 'bgra8unorm');
    const key = {};
    bindWgpuToonSurface(state, pipeline, key, COLOR, 3, 0.5);
    const groups = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    bindWgpuToonSurface(state, pipeline, key, COLOR, 3, 0.5);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(groups);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });
});

describe('buildWgpuToonDefineKey', () => {
  it('produces distinct stable strings per flag set', () => {
    expect(buildWgpuToonDefineKey(FLAT)).toBe('----');
    expect(
      buildWgpuToonDefineKey({ alphaMaskEnabled: true, doubleSided: true, hasBaseColorMap: true, hasRamp: true }),
    ).toBe('mdbr');
  });
});

describe('compileWgpuToonPipeline', () => {
  it('compiles a module and builds the pipeline with a 4-entry material layout', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuToonPipeline(state, FLAT, 'rgba16float');
    expect(pipeline.pipeline).toBeDefined();
    expect(fake.calls.some((c) => c.name === 'createShaderModule')).toBe(true);
    const matLayout = fake.calls
      .filter((c) => c.name === 'createBindGroupLayout')
      .map((c) => c.args[0] as { entries: unknown[] })
      .find((d) => d.entries.length === 4);
    expect(matLayout).toBeDefined();
  });

  it('compiles a cull-none pipeline for a double-sided key', () => {
    const { fake, state } = makeWgpuSceneState();
    compileWgpuToonPipeline(state, { ...FLAT, doubleSided: true }, 'bgra8unorm');
    const pipelineCall = fake.calls.find((c) => c.name === 'createRenderPipeline');
    const descriptor = pipelineCall!.args[0] as { primitive: { cullMode: string } };
    expect(descriptor.primitive.cullMode).toBe('none');
  });
});

describe('ensureWgpuToonPipeline', () => {
  it('caches one pipeline per define key + format under the toon namespace', () => {
    const { state } = makeWgpuSceneState();
    const a = ensureWgpuToonPipeline(state, FLAT, 'bgra8unorm');
    const b = ensureWgpuToonPipeline(state, FLAT, 'bgra8unorm');
    expect(a).toBe(b);
    expect([...getWgpuSceneRuntime(state).pipelineCache.keys()].some((k) => k.startsWith('toon:'))).toBe(true);
  });
});

describe('getWgpuToonModuleSourceForKey', () => {
  it('emits the feature consts and reads the shared light block', () => {
    expect(getWgpuToonModuleSourceForKey(FLAT)).toContain('const HAS_RAMP : bool = false');
    expect(getWgpuToonModuleSourceForKey({ ...FLAT, alphaMaskEnabled: true })).toContain(
      'const ALPHA_MASK : bool = true',
    );
    const source = getWgpuToonModuleSourceForKey(FLAT);
    expect(source).toContain('struct Frame');
    expect(source).toContain('frame.directionalRadiance');
    expect(source).toContain('fn fs_main');
  });

  it('declares the group(3) shadow bindings and shadow-maps the banded directional term', () => {
    for (const key of [FLAT, { ...FLAT, hasRamp: true }]) {
      const source = getWgpuToonModuleSourceForKey(key);
      expect(source).toContain('@group(3) @binding(1) var shadowMap : texture_depth_2d;');
      expect(source).toContain('@group(3) @binding(2) var shadowSampler : sampler_comparison;');
      expect(source).toContain('direct * sampleDirectionalShadow(in.worldPosition)');
      expect(source.match(/direct \* sampleDirectionalShadow\(in\.worldPosition\)/g)).toHaveLength(1);
    }
  });
});
