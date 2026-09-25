import { withKindMapEntry } from '@flighthq/registry/contract';
import {
  buildGlRenderRegistries,
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
  RichTextKind,
  Scale9SpriteKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  StandardMaterialKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { glSpriteRenderer } from './glSprite.ts';
import { glScene2DRenderPreset } from './scene2DGlPipeline.ts';

describe('glScene2DRenderPreset', () => {
  it('carries every standard 2D GL renderer bound', () => {
    const registries = glScene2DRenderPreset;
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
      const entry = registries.nodeRenderers.get(kind);
      expect(entry).toBeDefined();
      expect(entry).not.toBeNull();
    }
  });

  it('is a distinct object on every access (const identity, not a getter)', () => {
    expect(glScene2DRenderPreset).toBe(glScene2DRenderPreset);
  });

  it('carries the standard texture resolvers', () => {
    const registries = glScene2DRenderPreset;
    expect([...registries.textureResolvers.keys()].sort()).toEqual([...standardGlTextureResolvers.keys()].sort());
    expect(registries.textureResolvers.has(BitmapTextureSourceKind)).toBe(true);
    expect(registries.textureResolvers.has(ImageTextureSourceKind)).toBe(true);
    expect(registries.textureResolvers.has(RenderTargetTextureSourceKind)).toBe(true);
  });

  it('carries the standard fixed-function blend realizations', () => {
    const registries = glScene2DRenderPreset;
    expect([...registries.blendRealizations.keys()].sort()).toEqual([...standardGlBlendRealizations.keys()].sort());
    expect(registries.blendRealizations.has(BlendMode.Normal)).toBe(true);
    expect(registries.blendRealizations.has(BlendMode.Add)).toBe(true);
    expect(registries.blendRealizations.has(BlendMode.Multiply)).toBe(true);
    expect(registries.blendRealizations.has(BlendMode.Screen)).toBe(true);
  });

  it('carries the stroke tessellator in the slot table', () => {
    const registries = glScene2DRenderPreset;
    expect(registries.strokeTessellator).not.toBeNull();
    expect(registries.strokeTessellator).not.toBeNull();
  });

  it('carries the standard material renderer for StandardMaterialKind', () => {
    const registries = glScene2DRenderPreset;
    expect(registries.materialRenderers.size).toBe(1);
    const entry = registries.materialRenderers.get(StandardMaterialKind);
    expect(entry).toBeDefined();
    expect(entry).not.toBeNull();
  });

  it('starts with empty GL-specific tables that no family populates', () => {
    const registries = glScene2DRenderPreset;
    expect(registries.customEffectShaders.size).toBe(0);
    expect(registries.customMaterialShaders.size).toBe(0);
  });

  it('is frozen so late-register calls cannot mutate a shared preset', () => {
    expect(Object.isFrozen(glScene2DRenderPreset)).toBe(true);
  });
});

describe('manual single-capability pipeline', () => {
  it('carries only the explicitly registered Sprite renderer', () => {
    const registry = {
      ...buildGlRenderRegistries({}),
      nodeRenderers: withKindMapEntry(buildGlRenderRegistries({}).nodeRenderers, SpriteKind, glSpriteRenderer),
    };
    const registries = registry;
    expect(registries.nodeRenderers.size).toBe(1);
    expect(registries.nodeRenderers.has(SpriteKind)).toBe(true);
    expect(registries.blendRealizations.size).toBe(0);
    expect(registries.textureResolvers.size).toBe(0);
  });
});
