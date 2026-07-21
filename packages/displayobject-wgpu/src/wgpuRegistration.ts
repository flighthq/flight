import { registerRenderer } from '@flighthq/render';
import type { WgpuRenderState } from '@flighthq/types';
import {
  BitmapKind,
  DisplayObjectKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RenderCacheKind,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/types';

import { defaultWgpuBitmapRenderer } from './wgpuBitmap';
import { defaultWgpuRenderCacheRenderer } from './wgpuCache';
import { registerDefaultWgpuMaterial } from './wgpuDefaultMaterial';
import { defaultWgpuDisplayObjectRenderer } from './wgpuDisplayObject';
import { defaultWgpuParticleEmitter2DRenderer } from './wgpuParticleEmitter2D';
import { defaultWgpuQuadBatchRenderer } from './wgpuQuadBatch';
import { defaultWgpuRichTextRenderer } from './wgpuRichText';
import { defaultWgpuScale9ShapeRenderer } from './wgpuScale9Shape';
import { defaultWgpuShapeRenderer } from './wgpuShape';
import { defaultWgpuSpriteRenderer } from './wgpuSpriteRenderer';
import { defaultWgpuTextLabelRenderer } from './wgpuTextLabel';
import { defaultWgpuTilemapRenderer } from './wgpuTilemap';
import { defaultWgpuVideoRenderer } from './wgpuVideo';

/**
 * Registers all built-in display-object kind renderers and the default material on `state` in one
 * call. Registers: bitmap, shape, scale9shape, quadbatch, tilemap, particle emitter, text label,
 * rich text, video, display object (plain container), and the render-cache renderer. Also calls
 * `registerDefaultWgpuMaterial` so the batch pipeline resolves the default material immediately.
 *
 * This is a thin convenience wrapper around the individual `registerRenderer` calls — tree-shaking
 * is unchanged: apps that import only one kind's renderer still pull no extra weight. The function
 * itself can be tree-shaken when not called.
 */
export function registerWgpuDisplayObjectRenderers(state: WgpuRenderState): void {
  registerDefaultWgpuMaterial(state);
  registerRenderer(state, BitmapKind, defaultWgpuBitmapRenderer);
  registerRenderer(state, DisplayObjectKind, defaultWgpuDisplayObjectRenderer);
  registerRenderer(state, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer);
  registerRenderer(state, QuadBatchKind, defaultWgpuQuadBatchRenderer);
  registerRenderer(state, RichTextKind, defaultWgpuRichTextRenderer);
  registerRenderer(state, Scale9ShapeKind, defaultWgpuScale9ShapeRenderer);
  registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
  registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);
  registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
  registerRenderer(state, TilemapKind, defaultWgpuTilemapRenderer);
  registerRenderer(state, RenderCacheKind, defaultWgpuRenderCacheRenderer);
  registerRenderer(state, VideoKind, defaultWgpuVideoRenderer);
}

/**
 * Registers all built-in sprite-graph kind renderers and the default material on `state` in one
 * call. Registers: sprite, quad-batch, tilemap, and particle emitter. Also calls
 * `registerDefaultWgpuMaterial`. Use this when only drawing sprite-graph nodes, not display objects.
 */
export function registerWgpuSpriteRenderers(state: WgpuRenderState): void {
  registerDefaultWgpuMaterial(state);
  registerRenderer(state, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer);
  registerRenderer(state, QuadBatchKind, defaultWgpuQuadBatchRenderer);
  registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);
  registerRenderer(state, TilemapKind, defaultWgpuTilemapRenderer);
}
