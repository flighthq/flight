import { withKindMapEntry } from '@flighthq/registry/contract';
import { buildWgpuRenderRegistries } from '@flighthq/render-wgpu/contract';
import type { Kind, NodeRenderer, WgpuRenderRegistries } from '@flighthq/types/contract';
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
import { standardWgpuQuadMaterialRenderer } from './wgpuStandardMaterial';
import { wgpuTextLabelRenderer } from './wgpuTextLabel';
import { wgpuTilemapRenderer } from './wgpuTilemap';

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

export const wgpuScene2DRenderPreset: Readonly<WgpuRenderRegistries> = Object.freeze({
  ...buildWgpuRenderRegistries({}),
  materialRenderers: withKindMapEntry(new Map(), StandardMaterialKind, standardWgpuQuadMaterialRenderer),
  nodeRenderers: buildScene2dWgpuRenderers(),
});
