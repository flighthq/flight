import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { createEmptyWgpuRegistries, createWgpuPipeline } from '@flighthq/render-wgpu/contract';
import type { KeyedTable, Renderer, WgpuPipeline } from '@flighthq/types/contract';
import {
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
  StandardMaterialKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { defaultWgpuBitmapTextRenderer } from './wgpuBitmapText';
import { defaultWgpuRenderCacheRenderer } from './wgpuCache';
import { defaultWgpuScene2DRenderer } from './wgpuNode2D';
import { defaultWgpuParticleEmitter2DRenderer } from './wgpuParticleEmitter2D';
import { defaultWgpuQuadBatchRenderer } from './wgpuQuadBatch';
import { defaultWgpuRichTextRenderer } from './wgpuRichText';
import { defaultWgpuScale9ShapeRenderer } from './wgpuScale9Shape';
import { defaultWgpuMorphShapeRenderer, defaultWgpuShapeRenderer } from './wgpuShape';
import { defaultWgpuSpriteRenderer } from './wgpuSprite';
import { standardWgpuMaterialRenderer } from './wgpuStandardMaterial';
import { defaultWgpuTextLabelRenderer } from './wgpuTextLabel';
import { defaultWgpuTilemapRenderer } from './wgpuTilemap';

function buildScene2dWgpuRenderers(): KeyedTable<Renderer> {
  let table = createEmptyWgpuRegistries().renderers;
  table = withRegistryTableEntry(table, BitmapTextKind, defaultWgpuBitmapTextRenderer);
  table = withRegistryTableEntry(table, DisplayObjectKind, defaultWgpuScene2DRenderer);
  table = withRegistryTableEntry(table, MorphShapeKind, defaultWgpuMorphShapeRenderer);
  table = withRegistryTableEntry(table, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer);
  table = withRegistryTableEntry(table, QuadBatchKind, defaultWgpuQuadBatchRenderer);
  table = withRegistryTableEntry(table, RenderCacheKind, defaultWgpuRenderCacheRenderer);
  table = withRegistryTableEntry(table, RichTextKind, defaultWgpuRichTextRenderer);
  table = withRegistryTableEntry(table, Scale9ShapeKind, defaultWgpuScale9ShapeRenderer);
  table = withRegistryTableEntry(table, ShapeKind, defaultWgpuShapeRenderer);
  table = withRegistryTableEntry(table, SpriteKind, defaultWgpuSpriteRenderer);
  table = withRegistryTableEntry(table, TextLabelKind, defaultWgpuTextLabelRenderer);
  table = withRegistryTableEntry(table, TilemapKind, defaultWgpuTilemapRenderer);
  return table;
}

const _registries = createEmptyWgpuRegistries();

export const scene2dWgpuPipeline: WgpuPipeline = createWgpuPipeline({
  ..._registries,
  materialRenderers: withRegistryTableEntry(
    _registries.materialRenderers,
    StandardMaterialKind,
    standardWgpuMaterialRenderer,
  ),
  renderers: buildScene2dWgpuRenderers(),
});
