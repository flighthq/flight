import { BitmapTextKind } from '@flighthq/bitmaptext/contract';
import { EntityRuntimeKey } from '@flighthq/entity/contract';
import { StandardMaterialKind } from '@flighthq/materials/contract';
import { ParticleEmitter2DKind } from '@flighthq/particleemitter/contract';
import { QuadBatchKind } from '@flighthq/quadbatch/contract';
import type {
  WgpuDevice,
  WgpuRenderRegistries,
  WgpuRenderState,
  WgpuScene3DPass,
} from '@flighthq/render-wgpu/contract';
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

import * as wgpuPackage from './contract.ts';
import {
  wgpuScene2DRenderPreset,
  registerWgpuRenderPreset,
  registerWgpuScene2DRenderPreset,
} from './scene2DWgpuPipeline.ts';
import { wgpuMeshShapeRenderer } from './wgpuMeshShapeRenderer.ts';
import { wgpuShapeRenderer } from './wgpuShape.ts';
import { wgpuSpriteRenderer } from './wgpuSprite.ts';
import { registerWgpuStandardMaterial, standardWgpuQuadMaterialRenderer } from './wgpuStandardMaterial.ts';

describe('registerWgpuRenderPreset', () => {
  it('keeps unrelated kind-map keys and takes the preset value for shared keys', () => {
    const state = createRegistrationTestState();
    const registries = getWgpuRenderStateRuntime(state).registries;
    const keep = {};
    const old = {};
    const updated = {};
    const added = {};
    for (const map of KIND_MAP_SLOTS) {
      (registries as unknown as Record<string, ReadonlyMap<string, unknown>>)[map] = new Map([
        ['Keep', keep],
        ['Shared', old],
      ]);
    }
    const preset = { ...buildWgpuRenderRegistries({}), nodeRenderers: new Map() } as Record<string, unknown>;
    for (const map of KIND_MAP_SLOTS) {
      preset[map] = new Map([
        ['Shared', updated],
        ['Added', added],
      ]);
    }
    registerWgpuRenderPreset(state, preset as unknown as WgpuRenderRegistries);
    for (const map of KIND_MAP_SLOTS) {
      const table = (registries as unknown as Record<string, ReadonlyMap<string, unknown>>)[map];
      expect([map, table.get('Keep')]).toEqual([map, keep]);
      expect([map, table.get('Shared')]).toEqual([map, updated]);
      expect([map, table.get('Added')]).toEqual([map, added]);
      expect([map, table.size]).toEqual([map, 3]);
    }
  });

  it('replaces preset node-renderer kinds and keeps other kinds', () => {
    const state = createRegistrationTestState();
    registerNodeRenderer(state, 'Custom', wgpuSpriteRenderer);
    registerNodeRenderer(state, ShapeKind, wgpuShapeRenderer);
    registerWgpuRenderPreset(state, {
      ...buildWgpuRenderRegistries({}),
      nodeRenderers: new Map([[ShapeKind, wgpuMeshShapeRenderer]]),
    });
    const nodeRenderers = getRenderStateRuntime(state).registries.nodeRenderers;
    expect(nodeRenderers.get(ShapeKind)).toBe(wgpuMeshShapeRenderer);
    expect(nodeRenderers.get('Custom')).toBe(wgpuSpriteRenderer);
  });

  it('keeps each option slot when the preset leaves it unset and takes it when the preset sets it', () => {
    const state = createRegistrationTestState();
    const registries = getWgpuRenderStateRuntime(state).registries as unknown as Record<string, unknown>;
    const initial = Object.fromEntries(OPTION_SLOTS.map((slot) => [slot, { slot, value: 'initial' }]));
    Object.assign(registries, initial);
    for (const unset of [null, undefined]) {
      const preset = { ...buildWgpuRenderRegistries({}), nodeRenderers: new Map() } as Record<string, unknown>;
      for (const slot of OPTION_SLOTS) preset[slot] = unset;
      registerWgpuRenderPreset(state, preset as unknown as WgpuRenderRegistries);
      for (const slot of OPTION_SLOTS) expect([slot, registries[slot]]).toEqual([slot, initial[slot]]);
    }
    const replacement = Object.fromEntries(OPTION_SLOTS.map((slot) => [slot, { slot, value: 'preset' }]));
    registerWgpuRenderPreset(state, {
      ...buildWgpuRenderRegistries({}),
      nodeRenderers: new Map(),
      ...replacement,
    } as unknown as WgpuRenderRegistries);
    for (const slot of OPTION_SLOTS) expect([slot, registries[slot]]).toEqual([slot, replacement[slot]]);
  });

  it('replaces the pass list wholesale instead of appending to it', () => {
    const state = createRegistrationTestState();
    const registries = getWgpuRenderStateRuntime(state).registries;
    const statePass = (() => {}) as unknown as WgpuScene3DPass;
    const presetPass = (() => {}) as unknown as WgpuScene3DPass;
    registries.passes = [statePass];
    const presetPasses = [presetPass];
    registerWgpuRenderPreset(state, {
      ...buildWgpuRenderRegistries({}),
      nodeRenderers: new Map(),
      passes: presetPasses,
    });
    expect(registries.passes).toBe(presetPasses);
    expect(registries.passes).toEqual([presetPass]);
  });
});

describe('registerWgpuScene2DRenderPreset', () => {
  // A node renderer is bound by kind: registerNodeRenderer with one of the exported constants, for a
  // standard kind or a caller's own. No fixed-kind registrar that takes only the state remains, and
  // every renderer constant the preset binds is still exported alongside the preset registrars.
  it('leaves registerNodeRenderer with an exported constant as the only per-renderer registration', () => {
    const exports = Object.entries(wgpuPackage) as [string, unknown][];
    expect(exports.filter(([name]) => /^registerWgpu\w*Renderer$/.test(name)).map(([name]) => name)).toEqual([]);
    const constants = new Set(exports.map(([, value]) => value));
    for (const renderer of wgpuScene2DRenderPreset.nodeRenderers.values()) expect(constants.has(renderer)).toBe(true);
    expect(typeof wgpuPackage.registerWgpuScene2DRenderPreset).toBe('function');
    expect(typeof wgpuPackage.registerWgpuRenderPreset).toBe('function');
  });

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

const KIND_MAP_SLOTS = [
  'customMaterialShaders',
  'effects',
  'materialRenderers',
  'modifierSnippets',
  'textureResolvers',
  'velocityWriters',
] as const;

const OPTION_SLOTS = [
  'colorAdjustmentFeature',
  'colorAdjustmentFeatureGuard',
  'compressedTextureDecoder',
  'compressedTextureUpload',
  'gpuSkinning',
  'passes',
  'shapeRasterizer',
] as const;
