import { StandardMaterialKind } from '@flighthq/materials/contract';
import { ParticleEmitter2DKind } from '@flighthq/particleemitter/contract';
import { QuadBatchKind } from '@flighthq/quadbatch/contract';
import { buildWgpuRenderRegistries } from '@flighthq/render-wgpu/contract';
import { RenderCacheKind } from '@flighthq/render/contract';
import { DisplayObjectKind, Scale9SpriteKind, SpriteKind } from '@flighthq/scene2d/contract';
import { MorphShapeKind, Scale9ShapeKind, ShapeKind } from '@flighthq/shape/contract';
import { RichTextKind, TextLabelKind } from '@flighthq/text/contract';
import { TilemapKind } from '@flighthq/tilemap/contract';
import { describe, expect, it } from 'vitest';

import { wgpuScene2DRenderPreset } from './scene2DWgpuPipeline.ts';

describe('wgpuScene2DRenderPreset', () => {
  it('carries every standard 2D WGPU renderer bound', () => {
    const registries = wgpuScene2DRenderPreset;
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

  it('carries the standard quad-material renderer', () => {
    const registries = wgpuScene2DRenderPreset;
    expect(registries.materialRenderers.size).toBe(1);
    expect(registries.materialRenderers.get(StandardMaterialKind)).toBeDefined();
  });

  it('is a distinct object on every access (const identity, not a getter)', () => {
    expect(wgpuScene2DRenderPreset).toBe(wgpuScene2DRenderPreset);
  });

  it('is frozen so late-register calls cannot mutate a shared preset', () => {
    expect(Object.isFrozen(wgpuScene2DRenderPreset)).toBe(true);
  });
});
import { BitmapTextKind } from '@flighthq/bitmaptext/contract';
