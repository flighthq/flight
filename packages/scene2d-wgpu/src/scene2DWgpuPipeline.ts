import type { Kind } from '@flighthq/entity/contract';
import { StandardMaterialKind } from '@flighthq/materials/contract';
import { ParticleEmitter2DKind } from '@flighthq/particleemitter/contract';
import { QuadBatchKind } from '@flighthq/quadbatch/contract';
import { concatKindMap, withKindMapEntry } from '@flighthq/registry/contract';
import { buildWgpuRenderRegistries, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderRegistries, WgpuRenderState } from '@flighthq/render-wgpu/contract';
import type { NodeRenderer } from '@flighthq/render/contract';
import { RenderCacheKind, registerNodeRenderer } from '@flighthq/render/contract';
import { DisplayObjectKind, Scale9SpriteKind, SpriteKind } from '@flighthq/scene2d/contract';
import { MorphShapeKind, Scale9ShapeKind, ShapeKind } from '@flighthq/shape/contract';
import { RichTextKind, TextLabelKind } from '@flighthq/text/contract';
import { TilemapKind } from '@flighthq/tilemap/contract';

import { wgpuBitmapTextRenderer } from './wgpuBitmapText.ts';
import { wgpuRenderCacheRenderer } from './wgpuCache.ts';
import { wgpuScene2DRenderer } from './wgpuNode2D.ts';
import { wgpuParticleEmitter2DRenderer } from './wgpuParticleEmitter2D.ts';
import { wgpuQuadBatchRenderer } from './wgpuQuadBatch.ts';
import { wgpuRichTextRenderer } from './wgpuRichText.ts';
import { wgpuScale9ShapeRenderer } from './wgpuScale9Shape.ts';
import { wgpuScale9SpriteRenderer } from './wgpuScale9Sprite.ts';
import { wgpuMorphShapeRenderer, wgpuShapeRenderer } from './wgpuShape.ts';
import { wgpuSpriteRenderer } from './wgpuSprite.ts';
import { standardWgpuQuadMaterialRenderer } from './wgpuStandardMaterial.ts';
import { wgpuTextLabelRenderer } from './wgpuTextLabel.ts';
import { wgpuTilemapRenderer } from './wgpuTilemap.ts';

function buildScene2dWgpuRenderers(): ReadonlyMap<Kind, NodeRenderer> {
  let table: ReadonlyMap<Kind, NodeRenderer> = new Map();
  table = withKindMapEntry(table, BitmapTextKind, wgpuBitmapTextRenderer);
  table = withKindMapEntry(table, DisplayObjectKind, wgpuScene2DRenderer);
  table = withKindMapEntry(table, MorphShapeKind, wgpuMorphShapeRenderer);
  table = withKindMapEntry(table, ParticleEmitter2DKind, wgpuParticleEmitter2DRenderer);
  table = withKindMapEntry(table, QuadBatchKind, wgpuQuadBatchRenderer);
  table = withKindMapEntry(table, RenderCacheKind, wgpuRenderCacheRenderer);
  table = withKindMapEntry(table, RichTextKind, wgpuRichTextRenderer);
  table = withKindMapEntry(table, Scale9ShapeKind, wgpuScale9ShapeRenderer);
  table = withKindMapEntry(table, Scale9SpriteKind, wgpuScale9SpriteRenderer);
  table = withKindMapEntry(table, ShapeKind, wgpuShapeRenderer);
  table = withKindMapEntry(table, SpriteKind, wgpuSpriteRenderer);
  table = withKindMapEntry(table, TextLabelKind, wgpuTextLabelRenderer);
  table = withKindMapEntry(table, TilemapKind, wgpuTilemapRenderer);
  return table;
}

/**
 * Everything this backend needs that the CONTENT does not choose — the preset with no node renderers.
 *
 * A per-file manifest replaces exactly one part of a render configuration: the node renderers, because
 * those are what a document implies. The rest is backend machinery every build needs whatever the
 * content is, and some of it cannot be expressed as a catalog row at all. Splitting the two is what
 * lets a generated fragment compose into a COMPLETE configuration without dragging in the renderers
 * the content never asked for. See `canvasRenderInfrastructure` for the failure this prevents.
 */
export const wgpuRenderInfrastructure: Readonly<Omit<WgpuRenderRegistries, 'nodeRenderers'>> = Object.freeze({
  ...buildWgpuRenderRegistries({}),
  materialRenderers: withKindMapEntry(new Map(), StandardMaterialKind, standardWgpuQuadMaterialRenderer),
});

export const wgpuScene2DRenderPreset: Readonly<WgpuRenderRegistries> = Object.freeze({
  ...wgpuRenderInfrastructure,
  nodeRenderers: buildScene2dWgpuRenderers(),
});
import { BitmapTextKind } from '@flighthq/bitmaptext/contract';

/**
 * Registers every table of `preset` on an existing state: each node renderer through
 * registerNodeRenderer, in the preset's key order, and each WGPU registry table overlaid on the
 * state's own, so a preset entry replaces the same kind and every other registration the state
 * already holds is kept. A preset slot that is unset leaves the state's slot untouched.
 */
export function registerWgpuRenderPreset(state: WgpuRenderState, preset: Readonly<WgpuRenderRegistries>): void {
  for (const [kind, renderer] of preset.nodeRenderers) registerNodeRenderer(state, kind, renderer);
  const registries = getWgpuRenderStateRuntime(state).registries;
  if (preset.colorAdjustmentFeature != null) registries.colorAdjustmentFeature = preset.colorAdjustmentFeature;
  if (preset.colorAdjustmentFeatureGuard != null) {
    registries.colorAdjustmentFeatureGuard = preset.colorAdjustmentFeatureGuard;
  }
  if (preset.compressedTextureDecoder !== null) registries.compressedTextureDecoder = preset.compressedTextureDecoder;
  if (preset.compressedTextureUpload !== null) registries.compressedTextureUpload = preset.compressedTextureUpload;
  registries.customMaterialShaders = concatKindMap(registries.customMaterialShaders, preset.customMaterialShaders);
  registries.effects = concatKindMap(registries.effects, preset.effects);
  if (preset.gpuSkinning !== null) registries.gpuSkinning = preset.gpuSkinning;
  registries.materialRenderers = concatKindMap(registries.materialRenderers, preset.materialRenderers);
  registries.modifierSnippets = concatKindMap(registries.modifierSnippets, preset.modifierSnippets);
  if (preset.passes !== null) registries.passes = preset.passes;
  if (preset.shapeRasterizer !== null) registries.shapeRasterizer = preset.shapeRasterizer;
  registries.textureResolvers = concatKindMap(registries.textureResolvers, preset.textureResolvers);
  registries.velocityWriters = concatKindMap(registries.velocityWriters, preset.velocityWriters);
}

/** Registers the complete standard 2D WebGPU configuration, wgpuScene2DRenderPreset, on an existing state. */
export function registerWgpuScene2DRenderPreset(state: WgpuRenderState): void {
  registerWgpuRenderPreset(state, wgpuScene2DRenderPreset);
}
