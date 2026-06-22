import type { LinearColor } from '@flighthq/materials';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';
import type { WgpuUnlitDefineKey } from './wgpuUnlitPrelude';
import {
  bindWgpuUnlitSurface,
  buildWgpuUnlitDefineKey,
  compileWgpuUnlitPipeline,
  ensureWgpuUnlitPipeline,
  getWgpuUnlitModuleSourceForKey,
} from './wgpuUnlitPrelude';

const FLAT: WgpuUnlitDefineKey = { alphaMaskEnabled: false, doubleSided: false, hasColorMap: false };
const COLOR: LinearColor = [0.5, 0.25, 0.1, 1];

describe('bindWgpuUnlitSurface', () => {
  it('creates a material bind group once per key and writes its uniform', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuUnlitPipeline(state, FLAT, 'bgra8unorm');
    const key = {};
    bindWgpuUnlitSurface(state, pipeline, key, COLOR, 2, 0.5);
    const groups = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    bindWgpuUnlitSurface(state, pipeline, key, COLOR, 2, 0.5);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(groups);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });
});

describe('buildWgpuUnlitDefineKey', () => {
  it('produces distinct stable strings per flag set', () => {
    expect(buildWgpuUnlitDefineKey(FLAT)).toBe('---');
    expect(buildWgpuUnlitDefineKey({ alphaMaskEnabled: true, doubleSided: true, hasColorMap: true })).toBe('mdc');
  });
});

describe('compileWgpuUnlitPipeline', () => {
  it('compiles a module and builds the pipeline with a 3-entry material layout', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuUnlitPipeline(state, FLAT, 'rgba16float');
    expect(pipeline.pipeline).toBeDefined();
    expect(fake.calls.some((c) => c.name === 'createShaderModule')).toBe(true);
    const matLayout = fake.calls
      .filter((c) => c.name === 'createBindGroupLayout')
      .map((c) => c.args[0] as { entries: unknown[] })
      .find((d) => d.entries.length === 3);
    expect(matLayout).toBeDefined();
  });
});

describe('ensureWgpuUnlitPipeline', () => {
  it('caches one pipeline per define key + format under the unlit namespace', () => {
    const { state } = makeWgpuSceneState();
    const a = ensureWgpuUnlitPipeline(state, FLAT, 'bgra8unorm');
    const b = ensureWgpuUnlitPipeline(state, FLAT, 'bgra8unorm');
    expect(a).toBe(b);
    expect([...getWgpuSceneRuntime(state).pipelineCache.keys()].some((k) => k.startsWith('unlit:'))).toBe(true);
  });
});

describe('getWgpuUnlitModuleSourceForKey', () => {
  it('emits the feature consts and includes the shared prelude + fs_main', () => {
    expect(getWgpuUnlitModuleSourceForKey(FLAT)).toContain('const HAS_COLOR_MAP : bool = false');
    expect(getWgpuUnlitModuleSourceForKey({ ...FLAT, alphaMaskEnabled: true })).toContain(
      'const ALPHA_MASK : bool = true',
    );
    const source = getWgpuUnlitModuleSourceForKey(FLAT);
    expect(source).toContain('struct Frame');
    expect(source).toContain('fn fs_main');
  });
});
