import type { CanvasRenderRegistries } from '@flighthq/types/contract';
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

import { applyCanvasBlendMode } from './canvasMaterials';
import { getCanvasPipelineRegistries } from './canvasPipeline';
import { canvasShapeCommandTable } from './canvasShapeCommandTable';
import { scene2dCanvasPipeline } from './scene2dCanvasPipeline';

describe('scene2dCanvasPipeline', () => {
  let registries: Readonly<CanvasRenderRegistries>;

  beforeAll(() => {
    registries = getCanvasPipelineRegistries(scene2dCanvasPipeline);
  });

  it('is an Entity with EntityRuntimeKey', () => {
    expect(EntityRuntimeKey in scene2dCanvasPipeline).toBe(true);
  });

  it('is a distinct object on every access (const identity, not a getter)', () => {
    expect(scene2dCanvasPipeline).toBe(scene2dCanvasPipeline);
  });

  it('carries all twelve standard 2D Canvas renderers', () => {
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

  it('carries the native blend mode application policy', () => {
    expect(registries.blendModeApplication).toBe(applyCanvasBlendMode);
  });

  it('carries the sixteen standard shape commands (14 default + 2 texture)', () => {
    expect(registries.canvasShapeCommands).toBeDefined();
    expect(registries.canvasShapeCommands!.entries.size).toBe(16);
  });

  it('shape commands match the standalone table builder', () => {
    const standalone = canvasShapeCommandTable();
    expect(registries.canvasShapeCommands!.entries.size).toBe(standalone.entries.size);
    for (const [key] of standalone.entries) {
      expect(registries.canvasShapeCommands!.entries.has(key)).toBe(true);
    }
  });

  it('starts with an empty render effects table', () => {
    expect(registries.renderEffects.entries.size).toBe(0);
  });

  it('does not carry material renderers when none are registered', () => {
    expect(registries.materialRenderers).toBeUndefined();
  });
});
