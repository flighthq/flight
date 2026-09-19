import { allocateEmptyWgpuRenderRegistries, initializeEmptyWgpuRenderRegistries } from './wgpuPipeline';

describe('allocateEmptyWgpuRenderRegistries', () => {
  it('creates empty tables for every required WGPU policy seam', () => {
    const registries = allocateEmptyWgpuRenderRegistries();
    expect(registries.renderers.shape).toBe('keyed');
    expect(registries.compressedTextureDecoder).toBeUndefined();
    expect(registries.compressedTextureUpload).toBeUndefined();
    expect(registries.customMaterialShaders.shape).toBe('keyed');
    expect(registries.gpuSkinning).toBeUndefined();
    expect(registries.materialRenderers.shape).toBe('keyed');
    expect(registries.meshMaterialRenderers.shape).toBe('keyed');
    expect(registries.modifierSnippets.shape).toBe('keyed');
    expect(registries.renderEffects.shape).toBe('keyed');
    expect(registries.shapeRasterizer).toBeUndefined();
    // Opt-in: the stroke kernel's slot is allocated by enable*StrokePathTessellation, not by the
    // pipeline, so a pipeline nobody opted in on carries no table for it.
    expect(registries.strokeTessellator).toBeUndefined();
    expect(registries.textureResolvers.shape).toBe('keyed');
    expect(registries.velocityWriters.shape).toBe('keyed');
  });
});

describe('initializeEmptyWgpuRenderRegistries', () => {
  it('is the construction initializer of allocateEmptyWgpuRenderRegistries', () => {
    expect(typeof initializeEmptyWgpuRenderRegistries).toBe('function');
  });
});
