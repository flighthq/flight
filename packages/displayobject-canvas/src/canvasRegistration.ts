import { registerRenderer } from '@flighthq/render';
import type { CanvasRenderState, Kind, Renderer } from '@flighthq/types';
import {
  BitmapKind,
  DisplayObjectKind,
  ParticleEmitterKind,
  QuadBatchKind,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/types';

import { defaultCanvasBitmapRenderer } from './canvasBitmap';
import { defaultCanvasDisplayObjectRenderer } from './canvasDisplayObject';
import { defaultCanvasParticleEmitterRenderer } from './canvasParticleEmitter';
import { defaultCanvasQuadBatchRenderer } from './canvasQuadBatch';
import { defaultCanvasRichTextRenderer } from './canvasRichText';
import { defaultCanvasScale9ShapeRenderer } from './canvasScale9Shape';
import { defaultCanvasShapeRenderer } from './canvasShape';
import { defaultCanvasSpriteRenderer } from './canvasSprite';
import { defaultCanvasTextLabelRenderer } from './canvasTextLabel';
import { defaultCanvasTilemapRenderer } from './canvasTilemap';
import { defaultCanvasVideoRenderer } from './canvasVideo';

// Ordered list of [kind, renderer] pairs for every 2D display-object kind the Canvas backend
// supports. Exported as a data array so GL/WGPU backends can mirror the same shape without
// hardcoding the full kind list independently.
export const canvasDisplayObjectRendererEntries: ReadonlyArray<readonly [Kind, Renderer]> = [
  [BitmapKind, defaultCanvasBitmapRenderer],
  [DisplayObjectKind, defaultCanvasDisplayObjectRenderer],
  [ParticleEmitterKind, defaultCanvasParticleEmitterRenderer],
  [QuadBatchKind, defaultCanvasQuadBatchRenderer],
  [RichTextKind, defaultCanvasRichTextRenderer],
  [Scale9ShapeKind, defaultCanvasScale9ShapeRenderer],
  [ShapeKind, defaultCanvasShapeRenderer],
  [SpriteKind, defaultCanvasSpriteRenderer],
  [TextLabelKind, defaultCanvasTextLabelRenderer],
  [TilemapKind, defaultCanvasTilemapRenderer],
  [VideoKind, defaultCanvasVideoRenderer],
];

// Registers every default Canvas 2D display-object renderer into `state` in one call,
// replacing the ~11 individual registerRenderer calls a consumer would otherwise need.
// Tree-shakable: importing this is the opt-in; unused renderers in the entries array
// will be eliminated by the bundler if canvasDisplayObjectRendererEntries itself is tree-shaken.
export function registerCanvasDisplayObjectRenderers(state: CanvasRenderState): void {
  for (const [kind, renderer] of canvasDisplayObjectRendererEntries) {
    registerRenderer(state, kind, renderer);
  }
}
