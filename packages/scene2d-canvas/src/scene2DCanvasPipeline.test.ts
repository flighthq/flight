import type { CanvasRenderRegistry } from '@flighthq/types/contract';
import {
  BitmapTextKind,
  DisplayObjectKind,
  MorphShapeKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
  RegistryEntryState,
  RichTextKind,
  Scale9ShapeKind,
  Scale9SpriteKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { applyCanvasBlendMode } from './canvasMaterials';
import {} from './canvasPipeline';
import { canvasShapeCommandTable } from './canvasShapeCommandTable';
import { defaultScene2DCanvasRenderRegistry } from './scene2DCanvasPipeline';

describe('defaultScene2DCanvasRenderRegistry', () => {
  let registries: Readonly<CanvasRenderRegistry>;

  beforeAll(() => {
    registries = defaultScene2DCanvasRenderRegistry;
  });

  it('is a distinct object on every access (const identity, not a getter)', () => {
    expect(defaultScene2DCanvasRenderRegistry).toBe(defaultScene2DCanvasRenderRegistry);
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
      const entry = registries.renderers.entries.get(kind);
      expect(entry).toBeDefined();
      expect(entry?.state).toBe(RegistryEntryState.Bound);
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
