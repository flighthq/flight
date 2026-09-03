import { registerWgpuImageTextureResolver } from '@flighthq/render-wgpu/contract';
import { advanceVideoTexture, createVideoTexture } from '@flighthq/texture/contract';
import type { LinearColor, WgpuUnlitDefineKey } from '@flighthq/types/contract';
import { createVideoResource } from '@flighthq/video/contract';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState, makeWgpuSkinningAdapter } from './wgpuScene3DTestHelper';
import {
  bindWgpuUnlitSurface,
  bindWgpuUnlitVideoSurface,
  buildWgpuUnlitDefineKey,
  compileWgpuUnlitPipeline,
  ensureWgpuUnlitPipeline,
  getWgpuUnlitModuleSourceForKey,
} from './wgpuUnlitPrelude';

const FLAT: WgpuUnlitDefineKey = { alphaMaskEnabled: false, doubleSided: false, hasColorMap: false };
const COLOR: LinearColor = [0.5, 0.25, 0.1, 1];

describe('bindWgpuUnlitSurface', () => {
  it('creates a material bind group once per key and writes its uniform', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = compileWgpuUnlitPipeline(state, FLAT, 'bgra8unorm');
    const key = {};
    bindWgpuUnlitSurface(state, pipeline, key, COLOR, 2, 0.5, null);
    const groups = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    bindWgpuUnlitSurface(state, pipeline, key, COLOR, 2, 0.5, null);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(groups);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });
});

describe('bindWgpuUnlitVideoSurface', () => {
  it('uploads the ready video frame into the same unlit material layout', () => {
    const { fake, state } = makeWgpuScene3DState();
    const pipeline = compileWgpuUnlitPipeline(state, { ...FLAT, hasColorMap: true }, 'bgra8unorm');
    const element = document.createElement('video');
    Object.defineProperties(element, {
      readyState: { value: 4 },
      videoHeight: { value: 120 },
      videoWidth: { value: 160 },
    });
    const video = createVideoTexture(createVideoResource(element));
    advanceVideoTexture(video);
    registerWgpuImageTextureResolver(state);
    bindWgpuUnlitVideoSurface(state, pipeline, {}, COLOR, 1, 0.5, video);
    expect(fake.calls.some((c) => c.name === 'copyExternalImageToTexture')).toBe(true);
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
    const { fake, state } = makeWgpuScene3DState();
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
    const { state } = makeWgpuScene3DState();
    const a = ensureWgpuUnlitPipeline(state, FLAT, 'bgra8unorm');
    const b = ensureWgpuUnlitPipeline(state, FLAT, 'bgra8unorm');
    expect(a).toBe(b);
    expect([...getWgpuScene3DRuntime(state).pipelineCache.keys()].some((k) => k.startsWith('unlit:'))).toBe(true);
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
    expect(source).not.toContain('jointTexture');
    expect(getWgpuUnlitModuleSourceForKey(FLAT, true, makeWgpuSkinningAdapter())).toContain('@location(5) weights0');
  });
});
