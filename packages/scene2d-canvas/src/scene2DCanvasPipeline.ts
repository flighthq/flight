import { withKindMapEntry } from '@flighthq/registry/contract';
import type { CanvasRenderRegistries, Kind, NodeRenderer } from '@flighthq/types/contract';
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

function buildScene2dCanvasRenderers(): ReadonlyMap<Kind, NodeRenderer> {
  const registries = allocateEmptyCanvasRenderRegistries();
  let table = registries.nodeRenderers;
  table = withKindMapEntry(table, BitmapTextKind, canvasBitmapTextRenderer);
  table = withKindMapEntry(table, DisplayObjectKind, canvasScene2DRenderer);
  table = withKindMapEntry(table, MorphShapeKind, canvasMorphShapeRenderer);
  table = withKindMapEntry(table, ParticleEmitter2DKind, canvasParticleEmitter2DRenderer);
  table = withKindMapEntry(table, QuadBatchKind, canvasQuadBatchRenderer);
  table = withKindMapEntry(table, RenderCacheKind, canvasRenderCacheRenderer);
  table = withKindMapEntry(table, RichTextKind, canvasRichTextRenderer);
  table = withKindMapEntry(table, Scale9ShapeKind, canvasScale9ShapeRenderer);
  table = withKindMapEntry(table, Scale9SpriteKind, canvasScale9SpriteRenderer);
  table = withKindMapEntry(table, ShapeKind, canvasShapeRenderer);
  table = withKindMapEntry(table, SpriteKind, canvasSpriteRenderer);
  table = withKindMapEntry(table, TextLabelKind, canvasTextLabelRenderer);
  table = withKindMapEntry(table, TilemapKind, canvasTilemapRenderer);
  return table;
}

export const canvasScene2DRenderRegistries: Readonly<CanvasRenderRegistries> = {
  ...allocateEmptyCanvasRenderRegistries(),
  blendModeApplication: applyCanvasBlendMode,
  canvasShapeCommands: canvasShapeCommandTable(),
  nodeRenderers: buildScene2dCanvasRenderers(),
};
