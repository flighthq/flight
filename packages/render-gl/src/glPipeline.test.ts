import { allocateEmptyGlRenderRegistries, initializeEmptyGlRenderRegistries } from './glPipeline';

describe('allocateEmptyGlRenderRegistries', () => {
  it('creates a complete GlRenderRegistries with all required tables', () => {
    const registries = allocateEmptyGlRenderRegistries();
    expect(registries.nodeRenderers).toBeInstanceOf(Map);
    expect(registries.blendRealizations).toBeInstanceOf(Map);
    expect(registries.compressedTextureDecoder).toBeNull();
    expect(registries.compressedTextureUpload).toBeNull();
    expect(registries.customEffectShaders).toBeInstanceOf(Map);
    expect(registries.customMaterialShaders).toBeInstanceOf(Map);
    expect(registries.materialRenderers).toBeInstanceOf(Map);
    expect(registries.modifierSnippets).toBeInstanceOf(Map);
    expect(registries.pbrExtensions).toBeInstanceOf(Map);
    expect(registries.effects).toBeInstanceOf(Map);
    expect(registries.shapeRasterizer).toBeNull();
    expect(registries.strokeTessellator).toBeNull();
    expect(registries.textureResolvers).toBeInstanceOf(Map);
    expect(registries.velocityWriters).toBeInstanceOf(Map);
  });

  it('starts with zero entries in every keyed table', () => {
    const registries = allocateEmptyGlRenderRegistries();
    expect(registries.nodeRenderers.size).toBe(0);
    expect(registries.blendRealizations.size).toBe(0);
    expect(registries.textureResolvers.size).toBe(0);
  });
});

describe('initializeEmptyGlRenderRegistries', () => {
  it('is the construction initializer of allocateEmptyGlRenderRegistries', () => {
    expect(typeof initializeEmptyGlRenderRegistries).toBe('function');
  });
  // The reason every opt-in slot is `T | null` rather than `T?`: two registries objects must have the
  // same key set, so V8 gives them one hidden class and the per-shape reads on the draw path stay
  // monomorphic. An optional field that some pipelines omit would silently reintroduce a second shape.
  it('gives every registries object an identical key set, including the unfilled opt-in slots', () => {
    const first = Object.keys(allocateEmptyGlRenderRegistries()).sort();
    const second = Object.keys(allocateEmptyGlRenderRegistries()).sort();

    expect(first).toEqual(second);
    expect(first).toEqual(
      expect.arrayContaining([
        'compressedTextureDecoder',
        'compressedTextureUpload',
        'shapeRasterizer',
        'strokeTessellator',
      ]),
    );
  });

  it('leaves the opt-in slots null rather than allocating an empty table for them', () => {
    const registries = allocateEmptyGlRenderRegistries();

    expect(registries.compressedTextureDecoder).toBeNull();
    expect(registries.compressedTextureUpload).toBeNull();
    expect(registries.shapeRasterizer).toBeNull();
    expect(registries.strokeTessellator).toBeNull();
  });
});
