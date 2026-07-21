import { registerRenderer } from '@flighthq/render';
import type { GlRenderState } from '@flighthq/types';
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

import { defaultGlBitmapRenderer } from './glBitmap';
import { defaultGlRenderCacheRenderer } from './glCache';
import { defaultGlDisplayObjectRenderer } from './glDisplayObject';
import { defaultGlParticleEmitter2DRenderer } from './glParticleEmitter2D';
import { defaultGlQuadBatchRenderer } from './glQuadBatch';
import { defaultGlRichTextRenderer } from './glRichText';
import { defaultGlScale9ShapeRenderer } from './glScale9Shape';
import { defaultGlShapeRenderer } from './glShape';
import { defaultGlSpriteRenderer } from './glSpriteRenderer';
import { defaultGlTextLabelRenderer } from './glTextLabel';
import { defaultGlTilemapRenderer } from './glTilemap';
import { defaultGlVideoRenderer } from './glVideo';

/**
 * Registers every built-in GL display-object renderer against its kind in `state`.
 *
 * This is the convenience path — the tree-shakable golden path is registering each
 * `default*Renderer` descriptor individually via `registerRenderer`. Call this when you
 * want all renderers registered in one step and do not need to tree-shake individual leaf
 * types. The default material must be separately registered via `registerDefaultGlMaterial`.
 *
 * Registered renderers:
 * - `BitmapKind`         → `defaultGlBitmapRenderer`
 * - `DisplayObjectKind`  → `defaultGlDisplayObjectRenderer`
 * - `ParticleEmitter2DKind`→ `defaultGlParticleEmitter2DRenderer`
 * - `QuadBatchKind`      → `defaultGlQuadBatchRenderer`
 * - `RenderCacheKind`    → `defaultGlRenderCacheRenderer`
 * - `RichTextKind`       → `defaultGlRichTextRenderer`
 * - `Scale9ShapeKind`    → `defaultGlScale9ShapeRenderer`
 * - `ShapeKind`          → `defaultGlShapeRenderer`
 * - `SpriteKind`         → `defaultGlSpriteRenderer`
 * - `TextLabelKind`      → `defaultGlTextLabelRenderer`
 * - `TilemapKind`        → `defaultGlTilemapRenderer`
 * - `VideoKind`          → `defaultGlVideoRenderer`
 */
export function registerGlDisplayObjectRenderers(state: GlRenderState): void {
  registerRenderer(state, BitmapKind, defaultGlBitmapRenderer);
  registerRenderer(state, DisplayObjectKind, defaultGlDisplayObjectRenderer);
  registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
  registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
  registerRenderer(state, RenderCacheKind, defaultGlRenderCacheRenderer);
  registerRenderer(state, RichTextKind, defaultGlRichTextRenderer);
  registerRenderer(state, Scale9ShapeKind, defaultGlScale9ShapeRenderer);
  registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
  registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
  registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
  registerRenderer(state, TilemapKind, defaultGlTilemapRenderer);
  registerRenderer(state, VideoKind, defaultGlVideoRenderer);
}
