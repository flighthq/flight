import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { allocateEmptyWgpuRenderRegistries } from '@flighthq/render-wgpu/contract';
import type { KeyedTable, Renderer, WgpuRenderRegistries } from '@flighthq/types/contract';
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
  StandardMaterialKind,
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { wgpuBitmapTextRenderer } from './wgpuBitmapText';
import { wgpuRenderCacheRenderer } from './wgpuCache';
import { wgpuScene2DRenderer } from './wgpuNode2D';
import { wgpuParticleEmitter2DRenderer } from './wgpuParticleEmitter2D';
import { wgpuQuadBatchRenderer } from './wgpuQuadBatch';
import { wgpuRichTextRenderer } from './wgpuRichText';
import { wgpuScale9ShapeRenderer } from './wgpuScale9Shape';
import { wgpuScale9SpriteRenderer } from './wgpuScale9Sprite';
import { wgpuMorphShapeRenderer, wgpuShapeRenderer } from './wgpuShape';
import { wgpuSpriteRenderer } from './wgpuSprite';
import { standardWgpuMaterialRenderer } from './wgpuStandardMaterial';
import { wgpuTextLabelRenderer } from './wgpuTextLabel';
import { wgpuTilemapRenderer } from './wgpuTilemap';

function buildScene2dWgpuRenderers(): KeyedTable<Renderer> {
  let table = allocateEmptyWgpuRenderRegistries().renderers;
  table = withRegistryTableEntry(table, BitmapTextKind, wgpuBitmapTextRenderer);
  table = withRegistryTableEntry(table, DisplayObjectKind, wgpuScene2DRenderer);
  table = withRegistryTableEntry(table, MorphShapeKind, wgpuMorphShapeRenderer);
  table = withRegistryTableEntry(table, ParticleEmitter2DKind, wgpuParticleEmitter2DRenderer);
  table = withRegistryTableEntry(table, QuadBatchKind, wgpuQuadBatchRenderer);
  table = withRegistryTableEntry(table, RenderCacheKind, wgpuRenderCacheRenderer);
  table = withRegistryTableEntry(table, RichTextKind, wgpuRichTextRenderer);
  table = withRegistryTableEntry(table, Scale9ShapeKind, wgpuScale9ShapeRenderer);
  table = withRegistryTableEntry(table, Scale9SpriteKind, wgpuScale9SpriteRenderer);
  table = withRegistryTableEntry(table, ShapeKind, wgpuShapeRenderer);
  table = withRegistryTableEntry(table, SpriteKind, wgpuSpriteRenderer);
  table = withRegistryTableEntry(table, TextLabelKind, wgpuTextLabelRenderer);
  table = withRegistryTableEntry(table, TilemapKind, wgpuTilemapRenderer);
  return table;
}

const _registries = allocateEmptyWgpuRenderRegistries();

export const wgpuScene2DRenderRegistries: Readonly<WgpuRenderRegistries> = {
  ..._registries,
  materialRenderers: withRegistryTableEntry(
    _registries.materialRenderers,
    StandardMaterialKind,
    standardWgpuMaterialRenderer,
  ),
  renderers: buildScene2dWgpuRenderers(),
};
