import type { LinearColor } from '@flighthq/types';

import type { WgpuMatcapDefineKey } from './wgpuMatcapPrelude';
import {
  bindWgpuMatcapSurface,
  buildWgpuMatcapDefineKey,
  compileWgpuMatcapPipeline,
  ensureWgpuMatcapPipeline,
  getWgpuMatcapModuleSourceForKey,
} from './wgpuMatcapPrelude';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

const FLAT: WgpuMatcapDefineKey = { alphaMaskEnabled: false, doubleSided: false, hasMatcap: false };
const TINT: LinearColor = [0.5, 0.25, 0.1, 1];

describe('bindWgpuMatcapSurface', () => {
  it('creates a material bind group once per key and writes its uniform', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuMatcapPipeline(state, FLAT, 'bgra8unorm');
    const key = {};
    bindWgpuMatcapSurface(state, pipeline, key, TINT, 0.5);
    const groups = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    bindWgpuMatcapSurface(state, pipeline, key, TINT, 0.5);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(groups);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });
});

describe('buildWgpuMatcapDefineKey', () => {
  it('produces distinct stable strings per flag set', () => {
    expect(buildWgpuMatcapDefineKey(FLAT)).toBe('---');
    expect(buildWgpuMatcapDefineKey({ alphaMaskEnabled: true, doubleSided: true, hasMatcap: true })).toBe('mdt');
  });
});

describe('compileWgpuMatcapPipeline', () => {
  it('compiles a module and builds the pipeline with a 3-entry material layout', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuMatcapPipeline(state, FLAT, 'rgba16float');
    expect(pipeline.pipeline).toBeDefined();
    expect(fake.calls.some((c) => c.name === 'createShaderModule')).toBe(true);
    const matLayout = fake.calls
      .filter((c) => c.name === 'createBindGroupLayout')
      .map((c) => c.args[0] as { entries: unknown[] })
      .find((d) => d.entries.length === 3);
    expect(matLayout).toBeDefined();
  });
});

describe('ensureWgpuMatcapPipeline', () => {
  it('caches one pipeline per define key + format under the matcap namespace', () => {
    const { state } = makeWgpuSceneState();
    const a = ensureWgpuMatcapPipeline(state, FLAT, 'bgra8unorm');
    const b = ensureWgpuMatcapPipeline(state, FLAT, 'bgra8unorm');
    expect(a).toBe(b);
    expect([...getWgpuSceneRuntime(state).pipelineCache.keys()].some((k) => k.startsWith('matcap:'))).toBe(true);
  });
});

describe('getWgpuMatcapModuleSourceForKey', () => {
  it('emits the feature consts and includes the shared prelude + fs_main', () => {
    expect(getWgpuMatcapModuleSourceForKey(FLAT)).toContain('const HAS_MATCAP : bool = false');
    expect(getWgpuMatcapModuleSourceForKey({ ...FLAT, alphaMaskEnabled: true })).toContain(
      'const ALPHA_MASK : bool = true',
    );
    const source = getWgpuMatcapModuleSourceForKey(FLAT);
    expect(source).toContain('struct Frame');
    expect(source).toContain('fn fs_main');
  });
});
