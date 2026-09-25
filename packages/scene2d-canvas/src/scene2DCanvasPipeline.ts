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

import { canvasBitmapTextRenderer } from './canvasBitmapText.ts';
import { canvasRenderCacheRenderer } from './canvasCache.ts';
import { applyCanvasBlendMode } from './canvasMaterials.ts';
import { canvasScene2DRenderer } from './canvasNode2D.ts';
import { canvasParticleEmitter2DRenderer } from './canvasParticleEmitter2D.ts';
import { allocateEmptyCanvasRenderRegistries } from './canvasPipeline.ts';
import { canvasQuadBatchRenderer } from './canvasQuadBatch.ts';
import { canvasRichTextRenderer } from './canvasRichText.ts';
import { canvasScale9ShapeRenderer } from './canvasScale9Shape.ts';
import { canvasScale9SpriteRenderer } from './canvasScale9Sprite.ts';
import { canvasShapeRenderer, canvasMorphShapeRenderer } from './canvasShape.ts';
import { canvasShapeCommandTable } from './canvasShapeCommandTable.ts';
import { canvasSpriteRenderer } from './canvasSprite.ts';
import { canvasTextLabelRenderer } from './canvasTextLabel.ts';
import { canvasTilemapRenderer } from './canvasTilemap.ts';

function buildScene2dCanvasRenderers(): ReadonlyMap<Kind, NodeRenderer> {
  let table: ReadonlyMap<Kind, NodeRenderer> = new Map();
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

/**
 * Everything this backend needs that the CONTENT does not choose — the preset with no node renderers.
 *
 * ★ WHY THIS IS SEPARATE. A per-file manifest replaces exactly one part of a render configuration: the
 * node renderers, because those are what a document implies. The rest — the shape-drawing command
 * table, the blend-mode application — is backend machinery that every canvas build needs whatever the
 * content is, and no catalog row can express `blendModeApplication` at all because it is a plain
 * function with no kind to key on. Before this split there was nowhere to get one without the other,
 * so a generated fragment spread in place of the preset typechecked, built, and rendered a BLACK FRAME:
 * shapes had renderers but no commands to draw with. Composing this with a manifest fragment is the
 * supported way to get a complete configuration without pulling in the twelve renderers the content
 * never asked for.
 */
export const canvasRenderInfrastructure: Readonly<Omit<CanvasRenderRegistries, 'nodeRenderers'>> = Object.freeze({
  ...allocateEmptyCanvasRenderRegistries(),
  blendModeApplication: applyCanvasBlendMode,
  canvasShapeCommands: canvasShapeCommandTable(),
});

export const canvasScene2DRenderPreset: Readonly<CanvasRenderRegistries> = Object.freeze({
  ...canvasRenderInfrastructure,
  nodeRenderers: buildScene2dCanvasRenderers(),
});
