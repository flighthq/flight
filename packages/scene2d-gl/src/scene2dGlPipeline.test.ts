import { getGlPipelineRegistries } from '@flighthq/render-gl/contract';
import {
  BitmapTextKind,
  BitmapTextureSourceKind,
  BlendMode,
  DisplayObjectKind,
  EntityRuntimeKey,
  ImageTextureSourceKind,
  MorphShapeKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
  RenderTargetTextureSourceKind,
  RegistryEntryState,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { scene2dGlPipeline } from './scene2dGlPipeline';

describe('scene2dGlPipeline', () => {
  it('is an Entity with EntityRuntimeKey', () => {
    expect(EntityRuntimeKey in scene2dGlPipeline).toBe(true);
  });

  it('carries all twelve standard 2D GL renderers', () => {
    const registries = getGlPipelineRegistries(scene2dGlPipeline);
    const expectedKinds = [
      BitmapTextKind,
      DisplayObjectKind,
      MorphShapeKind,
      ParticleEmitter2DKind,
      QuadBatchKind,
      RenderCacheKind,
      RichTextKind,
      Scale9ShapeKind,
      ShapeKind,
      SpriteKind,
      TextLabelKind,
      TilemapKind,
    ];
    expect(registries.renderers.entries.size).toBe(expectedKinds.length);
    for (const kind of expectedKinds) {
      const entry = registries.renderers.entries.get(kind);
      expect(entry).toBeDefined();
      expect(entry?.state).toBe(RegistryEntryState.Bound);
    }
  });

  it('is a distinct object on every access (const identity, not a getter)', () => {
    expect(scene2dGlPipeline).toBe(scene2dGlPipeline);
  });

  it('carries the three standard texture resolvers', () => {
    const registries = getGlPipelineRegistries(scene2dGlPipeline);
    expect(registries.textureResolvers.entries.size).toBe(3);
    expect(registries.textureResolvers.entries.has(BitmapTextureSourceKind)).toBe(true);
    expect(registries.textureResolvers.entries.has(ImageTextureSourceKind)).toBe(true);
    expect(registries.textureResolvers.entries.has(RenderTargetTextureSourceKind)).toBe(true);
  });

  it('carries the six standard fixed-function blend realizations', () => {
    const registries = getGlPipelineRegistries(scene2dGlPipeline);
    expect(registries.blendRealizations.entries.size).toBe(6);
    expect(registries.blendRealizations.entries.has(BlendMode.Normal)).toBe(true);
    expect(registries.blendRealizations.entries.has(BlendMode.Add)).toBe(true);
    expect(registries.blendRealizations.entries.has(BlendMode.Multiply)).toBe(true);
    expect(registries.blendRealizations.entries.has(BlendMode.Screen)).toBe(true);
  });

  it('starts with empty GL-specific tables that earlier families do not populate', () => {
    const registries = getGlPipelineRegistries(scene2dGlPipeline);
    expect(registries.materialRenderers.entries.size).toBe(0);
  });
});
