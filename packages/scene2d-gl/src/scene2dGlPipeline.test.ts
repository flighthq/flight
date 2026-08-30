import { getGlPipelineRegistries } from '@flighthq/render-gl/contract';
import {
  BitmapTextKind,
  DisplayObjectKind,
  EntityRuntimeKey,
  MorphShapeKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
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

  it('starts with empty GL-specific tables that renderers family does not populate', () => {
    const registries = getGlPipelineRegistries(scene2dGlPipeline);
    expect(registries.blendRealizations.entries.size).toBe(0);
    expect(registries.textureResolvers.entries.size).toBe(0);
    expect(registries.materialRenderers.entries.size).toBe(0);
  });
});
