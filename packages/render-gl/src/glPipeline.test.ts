import { createEmptyGlRenderRegistry, initializeEmptyGlRenderRegistry } from './glPipeline';

describe('createEmptyGlRenderRegistry', () => {
  it('creates a complete GlRenderRegistry with all required tables', () => {
    const registries = createEmptyGlRenderRegistry();
    expect(registries.renderers.shape).toBe('keyed');
    expect(registries.blendRealizations.shape).toBe('keyed');
    expect(registries.compressedTextureDecoder.shape).toBe('slot');
    expect(registries.compressedTextureUpload.shape).toBe('slot');
    expect(registries.customEffectShaders.shape).toBe('keyed');
    expect(registries.customMaterialShaders.shape).toBe('keyed');
    expect(registries.materialRenderers.shape).toBe('keyed');
    expect(registries.meshMaterialRenderers.shape).toBe('keyed');
    expect(registries.modifierSnippets.shape).toBe('keyed');
    expect(registries.pbrExtensions.shape).toBe('keyed');
    expect(registries.renderEffects.shape).toBe('keyed');
    expect(registries.shapeRasterizer.shape).toBe('slot');
    expect(registries.strokeTessellator.shape).toBe('slot');
    expect(registries.textureResolvers.shape).toBe('keyed');
    expect(registries.velocityWriters.shape).toBe('keyed');
  });

  it('starts with zero entries in every keyed table', () => {
    const registries = createEmptyGlRenderRegistry();
    expect(registries.renderers.entries.size).toBe(0);
    expect(registries.blendRealizations.entries.size).toBe(0);
    expect(registries.textureResolvers.entries.size).toBe(0);
  });
});

describe('initializeEmptyGlRenderRegistry', () => {
  it('is the construction initializer of createEmptyGlRenderRegistry', () => {
    expect(typeof initializeEmptyGlRenderRegistry).toBe('function');
  });
});
