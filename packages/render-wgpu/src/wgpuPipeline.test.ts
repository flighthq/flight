import { createEmptyWgpuRenderRegistries, initializeEmptyWgpuRenderRegistries } from './wgpuPipeline';

describe('createEmptyWgpuRenderRegistries', () => {
  it('creates empty tables for every required WGPU policy seam', () => {
    const registries = createEmptyWgpuRenderRegistries();
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

describe('initializeEmptyWgpuRenderRegistries', () => {
  it('is the construction initializer of createEmptyWgpuRenderRegistries', () => {
    expect(typeof initializeEmptyWgpuRenderRegistries).toBe('function');
  });
});
