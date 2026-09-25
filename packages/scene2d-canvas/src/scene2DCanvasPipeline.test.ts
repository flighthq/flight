import type { CanvasRenderRegistries } from '@flighthq/types/contract';
import {
  BitmapTextKind,
  DisplayObjectKind,
  MorphShapeKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
  RichTextKind,
  Scale9ShapeKind,
  Scale9SpriteKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { applyCanvasBlendMode } from './canvasMaterials.ts';
import {} from './canvasPipeline.ts';
import { canvasShapeCommandTable } from './canvasShapeCommandTable.ts';
import { canvasScene2DRenderPreset } from './scene2DCanvasPipeline.ts';

describe('canvasScene2DRenderPreset', () => {
  let registries: Readonly<CanvasRenderRegistries>;

  beforeAll(() => {
    registries = canvasScene2DRenderPreset;
  });

  it('is a distinct object on every access (const identity, not a getter)', () => {
    expect(canvasScene2DRenderPreset).toBe(canvasScene2DRenderPreset);
  });

  it('carries every standard 2D Canvas renderer bound', () => {
    const expectedKinds = [
      BitmapTextKind,
      DisplayObjectKind,
      MorphShapeKind,
      ParticleEmitter2DKind,
      QuadBatchKind,
      RenderCacheKind,
      RichTextKind,
      Scale9ShapeKind,
      Scale9SpriteKind,
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

  it('carries the native blend mode application policy', () => {
    expect(registries.blendModeApplication).toBe(applyCanvasBlendMode);
  });

  it('carries a shape command table', () => {
    expect(registries.canvasShapeCommands).toBeDefined();
  });

  it('shape commands match the standalone table builder', () => {
    const standalone = canvasShapeCommandTable();
    expect(registries.canvasShapeCommands!.size).toBe(standalone.size);
    for (const [key] of standalone) {
      expect(registries.canvasShapeCommands!.has(key)).toBe(true);
    }
  });

  it('starts with an empty render effects table', () => {
    expect(registries.effects.size).toBe(0);
  });

  it('does not carry material renderers when none are registered', () => {
    expect(registries.materialRenderers).toBeUndefined();
  });
});
