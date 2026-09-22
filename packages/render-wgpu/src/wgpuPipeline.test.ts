import { allocateEmptyWgpuRenderRegistries, initializeEmptyWgpuRenderRegistries } from './wgpuPipeline';

describe('allocateEmptyWgpuRenderRegistries', () => {
  it('creates empty tables for every required WGPU policy seam', () => {
    const registries = allocateEmptyWgpuRenderRegistries();
    expect(registries.nodeRenderers).toBeInstanceOf(Map);
    expect(registries.nodeRenderers.size).toBe(0);
    expect(registries.compressedTextureDecoder).toBeNull();
    expect(registries.compressedTextureUpload).toBeNull();
    expect(registries.customMaterialShaders).toBeInstanceOf(Map);
    expect(registries.customMaterialShaders.size).toBe(0);
    expect(registries.gpuSkinning).toBeNull();
    expect(registries.materialRenderers).toBeInstanceOf(Map);
    expect(registries.materialRenderers.size).toBe(0);
    expect(registries.modifierSnippets).toBeInstanceOf(Map);
    expect(registries.modifierSnippets.size).toBe(0);
    expect(registries.effects).toBeInstanceOf(Map);
    expect(registries.effects.size).toBe(0);
    expect(registries.shapeRasterizer).toBeNull();
    // Opt-in: the stroke kernel's slot is allocated by enable*StrokePathTessellation, not by the
    // pipeline, so a pipeline nobody opted in on carries no table for it.
    expect(registries.strokeTessellator).toBeNull();
    expect(registries.textureResolvers).toBeInstanceOf(Map);
    expect(registries.textureResolvers.size).toBe(0);
    expect(registries.velocityWriters).toBeInstanceOf(Map);
    expect(registries.velocityWriters.size).toBe(0);
  });
});

describe('initializeEmptyWgpuRenderRegistries', () => {
  it('is the construction initializer of allocateEmptyWgpuRenderRegistries', () => {
    expect(typeof initializeEmptyWgpuRenderRegistries).toBe('function');
  });
});
