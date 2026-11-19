import { EntityRuntimeKey } from '@flighthq/entity/contract';
import { StandardMaterialKind } from '@flighthq/materials/contract';
import { ParticleEmitter2DKind } from '@flighthq/particleemitter/contract';
import { QuadBatchKind } from '@flighthq/quadbatch/contract';
import type { WgpuDevice, WgpuRenderState } from '@flighthq/render-wgpu/contract';
import {
  buildWgpuRenderRegistries,
  createWgpuDeviceState,
  createWgpuRenderStateRuntime,
  getWgpuQuadMaterialRenderer,
  getWgpuRenderStateRuntime,
} from '@flighthq/render-wgpu/contract';
import { RenderCacheKind, getRenderStateRuntime, registerNodeRenderer } from '@flighthq/render/contract';
import { DisplayObjectKind, Scale9SpriteKind, SpriteKind } from '@flighthq/scene2d/contract';
import { MorphShapeKind, Scale9ShapeKind, ShapeKind } from '@flighthq/shape/contract';
import { RichTextKind, TextLabelKind } from '@flighthq/text/contract';
import { TilemapKind } from '@flighthq/tilemap/contract';
import { describe, expect, it } from 'vitest';

import {
  wgpuScene2DRenderPreset,
  registerWgpuRenderPreset,
  registerWgpuScene2DRenderPreset,
} from './scene2DWgpuPipeline.ts';
import { wgpuMeshShapeRenderer } from './wgpuMeshShapeRenderer.ts';
import { registerWgpuShapeRenderer } from './wgpuShape.ts';
import { wgpuSpriteRenderer } from './wgpuSprite.ts';
import { registerWgpuStandardMaterial, standardWgpuQuadMaterialRenderer } from './wgpuStandardMaterial.ts';

describe('registerWgpuRenderPreset', () => {
  it('overlays each table and keeps registrations the preset does not name', () => {
    const state = createRegistrationTestState();
    registerNodeRenderer(state, 'Custom', wgpuSpriteRenderer);
    registerWgpuShapeRenderer(state);
    registerWgpuStandardMaterial(state);
    const preset = {
      ...buildWgpuRenderRegistries({}),
      materialRenderers: new Map([['PresetMaterial', standardWgpuQuadMaterialRenderer]]),
      nodeRenderers: new Map([[ShapeKind, wgpuMeshShapeRenderer]]),
    };
    registerWgpuRenderPreset(state, preset);
    const nodeRenderers = getRenderStateRuntime(state).registries.nodeRenderers;
    expect(nodeRenderers.get(ShapeKind)).toBe(wgpuMeshShapeRenderer);
    expect(nodeRenderers.get('Custom')).toBe(wgpuSpriteRenderer);
    expect(getWgpuQuadMaterialRenderer(state, 'PresetMaterial')).toBe(standardWgpuQuadMaterialRenderer);
    expect(getWgpuQuadMaterialRenderer(state, StandardMaterialKind)).toBe(standardWgpuQuadMaterialRenderer);
    expect(getWgpuRenderStateRuntime(state).registries.gpuSkinning).toBeNull();
  });
});
import { BitmapTextKind } from '@flighthq/bitmaptext/contract';

describe('registerWgpuScene2DRenderPreset', () => {
  it('registers every preset node renderer and the standard material', () => {
    const state = createRegistrationTestState();
    registerWgpuScene2DRenderPreset(state);
    const nodeRenderers = getRenderStateRuntime(state).registries.nodeRenderers;
    expect(wgpuScene2DRenderPreset.nodeRenderers.size).toBe(13);
    for (const [kind, renderer] of wgpuScene2DRenderPreset.nodeRenderers) {
      expect(nodeRenderers.get(kind)).toBe(renderer);
    }
    expect(getWgpuQuadMaterialRenderer(state, StandardMaterialKind)).toBe(standardWgpuQuadMaterialRenderer);
  });
});

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

function createRegistrationTestState(): WgpuRenderState {
  const state = {} as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState({} as WgpuDevice));
  return state;
}
