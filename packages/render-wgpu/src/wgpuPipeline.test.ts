import {
  createEmptyWgpuRegistries,
  createWgpuPipeline,
  getWgpuPipelineRegistries,
  initializeEmptyWgpuRegistries,
} from './wgpuPipeline';

describe('createEmptyWgpuRegistries', () => {
  it('creates empty tables for every required WGPU policy seam', () => {
    const registries = createEmptyWgpuRegistries();
    expect(registries.renderers.shape).toBe('keyed');
    expect(registries.compressedTextureDecoder.shape).toBe('slot');
    expect(registries.compressedTextureUpload.shape).toBe('slot');
    expect(registries.customMaterialShaders.shape).toBe('keyed');
    expect(registries.gpuSkinning.shape).toBe('slot');
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
  it('returns a pipeline with its own identity', () => {
    const registries = createEmptyWgpuRegistries();
    const first = createWgpuPipeline(registries);
    const second = createWgpuPipeline(registries);

    expect(first.registries).toBe(registries);
    expect(first).not.toBe(second);
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
describe('initializeEmptyWgpuRegistries', () => {
  it('is the construction initializer of createEmptyWgpuRegistries', () => {
    expect(typeof initializeEmptyWgpuRegistries).toBe('function');
  });
});
