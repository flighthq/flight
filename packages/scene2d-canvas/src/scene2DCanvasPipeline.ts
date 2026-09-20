import { withRegistryTableEntry } from '@flighthq/registry/contract';
import type { CanvasRenderRegistries, KeyedTable, Renderer } from '@flighthq/types/contract';
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

import { canvasBitmapTextRenderer } from './canvasBitmapText';
import { canvasRenderCacheRenderer } from './canvasCache';
import { applyCanvasBlendMode } from './canvasMaterials';
import { canvasScene2DRenderer } from './canvasNode2D';
import { canvasParticleEmitter2DRenderer } from './canvasParticleEmitter2D';
import { allocateEmptyCanvasRenderRegistries } from './canvasPipeline';
import { canvasQuadBatchRenderer } from './canvasQuadBatch';
import { canvasRichTextRenderer } from './canvasRichText';
import { canvasScale9ShapeRenderer } from './canvasScale9Shape';
import { canvasScale9SpriteRenderer } from './canvasScale9Sprite';
import { canvasShapeRenderer, canvasMorphShapeRenderer } from './canvasShape';
import { canvasShapeCommandTable } from './canvasShapeCommandTable';
import { canvasSpriteRenderer } from './canvasSprite';
import { canvasTextLabelRenderer } from './canvasTextLabel';
import { canvasTilemapRenderer } from './canvasTilemap';

function buildScene2dCanvasRenderers(): KeyedTable<Renderer> {
  const registries = allocateEmptyCanvasRenderRegistries();
  let table = registries.renderers;
  table = withRegistryTableEntry(table, BitmapTextKind, canvasBitmapTextRenderer);
  table = withRegistryTableEntry(table, DisplayObjectKind, canvasScene2DRenderer);
  table = withRegistryTableEntry(table, MorphShapeKind, canvasMorphShapeRenderer);
  table = withRegistryTableEntry(table, ParticleEmitter2DKind, canvasParticleEmitter2DRenderer);
  table = withRegistryTableEntry(table, QuadBatchKind, canvasQuadBatchRenderer);
  table = withRegistryTableEntry(table, RenderCacheKind, canvasRenderCacheRenderer);
  table = withRegistryTableEntry(table, RichTextKind, canvasRichTextRenderer);
  table = withRegistryTableEntry(table, Scale9ShapeKind, canvasScale9ShapeRenderer);
  table = withRegistryTableEntry(table, Scale9SpriteKind, canvasScale9SpriteRenderer);
  table = withRegistryTableEntry(table, ShapeKind, canvasShapeRenderer);
  table = withRegistryTableEntry(table, SpriteKind, canvasSpriteRenderer);
  table = withRegistryTableEntry(table, TextLabelKind, canvasTextLabelRenderer);
  table = withRegistryTableEntry(table, TilemapKind, canvasTilemapRenderer);
  return table;
}

export const canvasScene2DRenderRegistries: Readonly<CanvasRenderRegistries> = {
  ...allocateEmptyCanvasRenderRegistries(),
  blendModeApplication: applyCanvasBlendMode,
  canvasShapeCommands: canvasShapeCommandTable(),
  renderers: buildScene2dCanvasRenderers(),
};
