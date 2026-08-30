import type { WgpuPipeline } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createEmptyWgpuRegistries, createWgpuPipeline, getWgpuPipelineRegistries } from './wgpuPipeline';

describe('createEmptyWgpuRegistries', () => {
  it('creates empty tables for every required WGPU policy seam', () => {
    const registries = createEmptyWgpuRegistries();
    expect(registries.renderers.shape).toBe('keyed');
    expect(registries.compressedTextureDecoder.shape).toBe('slot');
    expect(registries.compressedTextureUpload.shape).toBe('slot');
    expect(registries.customMaterialShaders.shape).toBe('keyed');
    expect(registries.materialRenderers.shape).toBe('keyed');
    expect(registries.meshMaterialRenderers.shape).toBe('keyed');
    expect(registries.modifierSnippets.shape).toBe('keyed');
    expect(registries.renderEffects.shape).toBe('keyed');
    expect(registries.shapeRasterizer.shape).toBe('slot');
    expect(registries.strokeTessellator.shape).toBe('slot');
    expect(registries.textureResolvers.shape).toBe('keyed');
    expect(registries.velocityWriters.shape).toBe('keyed');
  });
});

describe('createWgpuPipeline', () => {
  it('returns an Entity-backed pipeline with its own runtime identity', () => {
    const registries = createEmptyWgpuRegistries();
    const first = createWgpuPipeline(registries);
    const second = createWgpuPipeline(registries);

    expect(EntityRuntimeKey in first).toBe(true);
    expect(first).not.toBe(second);
    expect(first[EntityRuntimeKey]).not.toBe(second[EntityRuntimeKey]);
  });

  it('rejects a plain literal at the Entity boundary', () => {
    const literal = { registries: createEmptyWgpuRegistries() } as unknown as WgpuPipeline;
    expect(EntityRuntimeKey in literal).toBe(false);
  });

  it('carries the supplied immutable registration snapshot', () => {
    const registries = createEmptyWgpuRegistries();
    const pipeline = createWgpuPipeline(registries);
    expect(getWgpuPipelineRegistries(pipeline)).toBe(registries);
  });
});

describe('getWgpuPipelineRegistries', () => {
  it('returns the registries captured by the explicit pipeline', () => {
    const registries = createEmptyWgpuRegistries();
    expect(getWgpuPipelineRegistries(createWgpuPipeline(registries))).toBe(registries);
  });
});
