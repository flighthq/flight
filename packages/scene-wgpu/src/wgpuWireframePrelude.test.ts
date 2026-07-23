import type { LinearColor } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';
import {
  bindWgpuWireframeColor,
  compileWgpuWireframePipeline,
  ensureWgpuWireframePipeline,
  getWgpuWireframeModuleSource,
} from './wgpuWireframePrelude';

const COLOR: LinearColor = [1, 0, 0, 1];

describe('bindWgpuWireframeColor', () => {
  it('creates a color bind group once per key and writes its uniform', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuWireframePipeline(state, 'bgra8unorm');
    const key = {};
    bindWgpuWireframeColor(state, pipeline, key, COLOR);
    const groups = fake.calls.filter((c) => c.name === 'createBindGroup').length;
    bindWgpuWireframeColor(state, pipeline, key, COLOR);
    expect(fake.calls.filter((c) => c.name === 'createBindGroup').length).toBe(groups);
    expect(fake.calls.some((c) => c.name === 'writeBuffer')).toBe(true);
  });
});

describe('compileWgpuWireframePipeline', () => {
  it('builds a line-list pipeline with a single-uniform material layout', () => {
    const { fake, state } = makeWgpuSceneState();
    const pipeline = compileWgpuWireframePipeline(state, 'rgba16float');
    expect(pipeline.pipeline).toBeDefined();
    const pipelineCall = fake.calls.find((c) => c.name === 'createRenderPipeline');
    expect((pipelineCall!.args[0] as { primitive: { topology: string } }).primitive.topology).toBe('line-list');
  });
});

describe('ensureWgpuWireframePipeline', () => {
  it('caches one pipeline per format under the wireframe namespace', () => {
    const { state } = makeWgpuSceneState();
    const a = ensureWgpuWireframePipeline(state, 'bgra8unorm');
    const b = ensureWgpuWireframePipeline(state, 'bgra8unorm');
    expect(a).toBe(b);
    expect([...getWgpuSceneRuntime(state).pipelineCache.keys()].some((k) => k.startsWith('wireframe:'))).toBe(true);
  });
});

describe('getWgpuWireframeModuleSource', () => {
  it('includes the shared prelude and a fs_main returning the color', () => {
    const source = getWgpuWireframeModuleSource();
    expect(source).toContain('struct Frame');
    expect(source).toContain('fn fs_main');
    expect(source).toContain('material.color');
  });
});
