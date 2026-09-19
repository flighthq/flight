import { withRegistryTableEntry } from '@flighthq/registry/contract';
import {
  allocateEmptyGlRenderRegistries,
  standardGlBlendRealizations,
  standardGlTextureResolvers,
} from '@flighthq/render-gl/contract';
import {
  BitmapTextKind,
  BitmapTextureSourceKind,
  BlendMode,
  DisplayObjectKind,
  ImageTextureSourceKind,
  MorphShapeKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
  RenderTargetTextureSourceKind,
  RegistryEntryState,
  RichTextKind,
  Scale9SpriteKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  StandardMaterialKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { defaultGlSpriteRenderer } from './glSprite';
import { defaultScene2DGlRenderRegistries } from './scene2DGlPipeline';

describe('defaultScene2DGlRenderRegistries', () => {
  it('carries every standard 2D GL renderer bound', () => {
    const registries = defaultScene2DGlRenderRegistries;
    const expectedKinds = [
      BitmapTextKind,
      DisplayObjectKind,
      MorphShapeKind,
      ParticleEmitter2DKind,
      QuadBatchKind,
      RenderCacheKind,
      RichTextKind,
      Scale9SpriteKind,
      Scale9ShapeKind,
      ShapeKind,
      SpriteKind,
      TextLabelKind,
      TilemapKind,
    ];
    for (const kind of expectedKinds) {
      const entry = registries.renderers.entries.get(kind);
      expect(entry).toBeDefined();
      expect(entry?.state).toBe(RegistryEntryState.Bound);
    }
  });

  it('is a distinct object on every access (const identity, not a getter)', () => {
    expect(defaultScene2DGlRenderRegistries).toBe(defaultScene2DGlRenderRegistries);
  });

  it('carries the standard texture resolvers', () => {
    const registries = defaultScene2DGlRenderRegistries;
    expect([...registries.textureResolvers.entries.keys()].sort()).toEqual(
      [...standardGlTextureResolvers.entries.keys()].sort(),
    );
    expect(registries.textureResolvers.entries.has(BitmapTextureSourceKind)).toBe(true);
    expect(registries.textureResolvers.entries.has(ImageTextureSourceKind)).toBe(true);
    expect(registries.textureResolvers.entries.has(RenderTargetTextureSourceKind)).toBe(true);
  });

  it('carries the standard fixed-function blend realizations', () => {
    const registries = defaultScene2DGlRenderRegistries;
    expect([...registries.blendRealizations.entries.keys()].sort()).toEqual(
      [...standardGlBlendRealizations.entries.keys()].sort(),
    );
    expect(registries.blendRealizations.entries.has(BlendMode.Normal)).toBe(true);
    expect(registries.blendRealizations.entries.has(BlendMode.Add)).toBe(true);
    expect(registries.blendRealizations.entries.has(BlendMode.Multiply)).toBe(true);
    expect(registries.blendRealizations.entries.has(BlendMode.Screen)).toBe(true);
  });

  it('carries the stroke tessellator in the slot table', () => {
    const registries = defaultScene2DGlRenderRegistries;
    expect(registries.strokeTessellator.entry).not.toBeNull();
    expect(registries.strokeTessellator.entry?.state).toBe(RegistryEntryState.Bound);
  });

  it('carries the standard material renderer for StandardMaterialKind', () => {
    const registries = defaultScene2DGlRenderRegistries;
    expect(registries.materialRenderers.entries.size).toBe(1);
    const entry = registries.materialRenderers.entries.get(StandardMaterialKind);
    expect(entry).toBeDefined();
    expect(entry?.state).toBe(RegistryEntryState.Bound);
  });

  it('starts with empty GL-specific tables that no family populates', () => {
    const registries = defaultScene2DGlRenderRegistries;
    expect(registries.customEffectShaders.entries.size).toBe(0);
    expect(registries.customMaterialShaders.entries.size).toBe(0);
  });
});

describe('manual single-capability pipeline', () => {
  it('carries only the explicitly registered Sprite renderer', () => {
    const registry = {
      ...allocateEmptyGlRenderRegistries(),
      renderers: withRegistryTableEntry(
        allocateEmptyGlRenderRegistries().renderers,
        SpriteKind,
        defaultGlSpriteRenderer,
      ),
    };
    const registries = registry;
    expect(registries.renderers.entries.size).toBe(1);
    expect(registries.renderers.entries.has(SpriteKind)).toBe(true);
    expect(registries.blendRealizations.entries.size).toBe(0);
    expect(registries.textureResolvers.entries.size).toBe(0);
  });
});
