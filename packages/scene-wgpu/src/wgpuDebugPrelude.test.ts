import type { WgpuDebugDefineKey } from './wgpuDebugPrelude';
import {
  bindWgpuDebugSurface,
  buildWgpuDebugDefineKey,
  compileWgpuDebugPipeline,
  ensureWgpuDebugPipeline,
  getWgpuDebugModuleSourceForKey,
} from './wgpuDebugPrelude';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

const DEPTH: WgpuDebugDefineKey = { hasNormalMap: false, mode: 'depth' };
const NORMAL: WgpuDebugDefineKey = { hasNormalMap: false, mode: 'normal' };
const NORMAL_MAP: WgpuDebugDefineKey = { hasNormalMap: true, mode: 'normal' };

describe('bindWgpuDebugSurface', () => {
  it('creates a material bind group once per key and writes its uniform', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuDebugPipeline(state, DEPTH, 'bgra8unorm');
    const key = {};
    bindWgpuDebugSurface(state, pipeline, key, 0.1, 100, 1);
    const groups = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    bindWgpuDebugSurface(state, pipeline, key, 0.1, 100, 1);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(groups);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });
});

describe('buildWgpuDebugDefineKey', () => {
  it('produces distinct stable strings per mode and normal-map flag', () => {
    expect(buildWgpuDebugDefineKey(DEPTH)).toBe('d-');
    expect(buildWgpuDebugDefineKey(NORMAL)).toBe('n-');
    expect(buildWgpuDebugDefineKey(NORMAL_MAP)).toBe('nm');
  });
});

describe('compileWgpuDebugPipeline', () => {
  it('compiles a module and builds the pipeline with a 3-entry material layout', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuDebugPipeline(state, NORMAL, 'rgba16float');
    expect(pipeline.pipeline).toBeDefined();
    expect(fake.calls.some((c) => c.name === 'createShaderModule')).toBe(true);
    const matLayout = fake.calls
      .filter((c) => c.name === 'createBindGroupLayout')
      .map((c) => c.args[0] as { entries: unknown[] })
      .find((d) => d.entries.length === 3);
    expect(matLayout).toBeDefined();
  });
});

describe('ensureWgpuDebugPipeline', () => {
  it('caches variants under the debug namespace with distinct depth and normal entries', () => {
    const { state } = makeWgpuSceneState();
    const depthFirst = ensureWgpuDebugPipeline(state, DEPTH, 'bgra8unorm');
    const depthSecond = ensureWgpuDebugPipeline(state, DEPTH, 'bgra8unorm');
    expect(depthSecond).toBe(depthFirst);

    const normalPipeline = ensureWgpuDebugPipeline(state, NORMAL, 'bgra8unorm');
    expect(normalPipeline).not.toBe(depthFirst);

    const keys = [...getWgpuSceneRuntime(state).pipelineCache.keys()];
    expect(keys.some((k) => k.startsWith('debug:'))).toBe(true);
    expect(keys).toContain('debug:bgra8unorm|d-');
    expect(keys).toContain('debug:bgra8unorm|n-');
  });
});

describe('getWgpuDebugModuleSourceForKey', () => {
  it('emits the right mode const and includes the shared prelude + fs_main', () => {
    const depthSource = getWgpuDebugModuleSourceForKey(DEPTH);
    expect(depthSource).toContain('const MODE : i32 = DEPTH_MODE');
    expect(getWgpuDebugModuleSourceForKey(NORMAL)).toContain('const MODE : i32 = NORMAL_MODE');
    expect(depthSource).toContain('const HAS_NORMAL_MAP : bool = false');
    expect(getWgpuDebugModuleSourceForKey(NORMAL_MAP)).toContain('const HAS_NORMAL_MAP : bool = true');
    expect(depthSource).toContain('struct Frame');
    expect(depthSource).toContain('fn fs_main');
  });
});
