import { withRegistryTableEntry } from '@flighthq/registry/contract';
import type { CanvasPipeline, KeyedTable, Renderer } from '@flighthq/types/contract';
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
  TextLabelKind,
  TilemapKind,
} from '@flighthq/types/contract';

import { defaultCanvasBitmapTextRenderer } from './canvasBitmapText';
import { defaultCanvasRenderCacheRenderer } from './canvasCache';
import { applyCanvasBlendMode } from './canvasMaterials';
import { defaultCanvasScene2DRenderer } from './canvasNode2D';
import { defaultCanvasParticleEmitter2DRenderer } from './canvasParticleEmitter2D';
import { createCanvasPipeline, createEmptyCanvasRegistries } from './canvasPipeline';
import { defaultCanvasQuadBatchRenderer } from './canvasQuadBatch';
import { defaultCanvasRichTextRenderer } from './canvasRichText';
import { defaultCanvasScale9ShapeRenderer } from './canvasScale9Shape';
import { defaultCanvasShapeRenderer, defaultCanvasMorphShapeRenderer } from './canvasShape';
import { canvasShapeCommandTable } from './canvasShapeCommandTable';
import { defaultCanvasSpriteRenderer } from './canvasSprite';
import { defaultCanvasTextLabelRenderer } from './canvasTextLabel';
import { defaultCanvasTilemapRenderer } from './canvasTilemap';

function buildScene2dCanvasRenderers(): KeyedTable<Renderer> {
  const registries = createEmptyCanvasRegistries();
  let table = registries.renderers;
  table = withRegistryTableEntry(table, BitmapTextKind, defaultCanvasBitmapTextRenderer);
  table = withRegistryTableEntry(table, DisplayObjectKind, defaultCanvasScene2DRenderer);
  table = withRegistryTableEntry(table, MorphShapeKind, defaultCanvasMorphShapeRenderer);
  table = withRegistryTableEntry(table, ParticleEmitter2DKind, defaultCanvasParticleEmitter2DRenderer);
  table = withRegistryTableEntry(table, QuadBatchKind, defaultCanvasQuadBatchRenderer);
  table = withRegistryTableEntry(table, RenderCacheKind, defaultCanvasRenderCacheRenderer);
  table = withRegistryTableEntry(table, RichTextKind, defaultCanvasRichTextRenderer);
  table = withRegistryTableEntry(table, Scale9ShapeKind, defaultCanvasScale9ShapeRenderer);
  table = withRegistryTableEntry(table, ShapeKind, defaultCanvasShapeRenderer);
  table = withRegistryTableEntry(table, SpriteKind, defaultCanvasSpriteRenderer);
  table = withRegistryTableEntry(table, TextLabelKind, defaultCanvasTextLabelRenderer);
  table = withRegistryTableEntry(table, TilemapKind, defaultCanvasTilemapRenderer);
  return table;
}

export const scene2dCanvasPipeline: CanvasPipeline = createCanvasPipeline({
  ...createEmptyCanvasRegistries(),
  blendModeApplication: applyCanvasBlendMode,
  canvasShapeCommands: canvasShapeCommandTable(),
  renderers: buildScene2dCanvasRenderers(),
});
