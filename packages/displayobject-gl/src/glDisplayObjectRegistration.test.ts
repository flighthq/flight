import { getRenderStateRuntime } from '@flighthq/render';
import { createGlRenderState } from '@flighthq/render-gl';
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
import { registerGlDisplayObjectRenderers } from './glDisplayObjectRegistration';
import { defaultGlParticleEmitter2DRenderer } from './glParticleEmitter2D';
import { defaultGlQuadBatchRenderer } from './glQuadBatch';
import { defaultGlRichTextRenderer } from './glRichText';
import { defaultGlScale9ShapeRenderer } from './glScale9Shape';
import { defaultGlShapeRenderer } from './glShape';
import { defaultGlSpriteRenderer } from './glSpriteRenderer';
import { defaultGlTextLabelRenderer } from './glTextLabel';
import { defaultGlTilemapRenderer } from './glTilemap';
import { defaultGlVideoRenderer } from './glVideo';

function makeState(): GlRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  return createGlRenderState(canvas);
}

describe('registerGlDisplayObjectRenderers', () => {
  it('registers all twelve display-object renderer kinds in one call', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    const { rendererMap } = getRenderStateRuntime(state);
    expect(rendererMap.get(BitmapKind)).toBe(defaultGlBitmapRenderer);
    expect(rendererMap.get(DisplayObjectKind)).toBe(defaultGlDisplayObjectRenderer);
    expect(rendererMap.get(ParticleEmitter2DKind)).toBe(defaultGlParticleEmitter2DRenderer);
    expect(rendererMap.get(QuadBatchKind)).toBe(defaultGlQuadBatchRenderer);
    expect(rendererMap.get(RenderCacheKind)).toBe(defaultGlRenderCacheRenderer);
    expect(rendererMap.get(RichTextKind)).toBe(defaultGlRichTextRenderer);
    expect(rendererMap.get(Scale9ShapeKind)).toBe(defaultGlScale9ShapeRenderer);
    expect(rendererMap.get(ShapeKind)).toBe(defaultGlShapeRenderer);
    expect(rendererMap.get(SpriteKind)).toBe(defaultGlSpriteRenderer);
    expect(rendererMap.get(TextLabelKind)).toBe(defaultGlTextLabelRenderer);
    expect(rendererMap.get(TilemapKind)).toBe(defaultGlTilemapRenderer);
    expect(rendererMap.get(VideoKind)).toBe(defaultGlVideoRenderer);
  });

  it('registers BitmapKind with the default bitmap renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(BitmapKind)).toBe(defaultGlBitmapRenderer);
  });

  it('registers DisplayObjectKind with the default display object renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(DisplayObjectKind)).toBe(defaultGlDisplayObjectRenderer);
  });

  it('registers ParticleEmitter2DKind with the default particle emitter renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(ParticleEmitter2DKind)).toBe(
      defaultGlParticleEmitter2DRenderer,
    );
  });

  it('registers QuadBatchKind with the default quad batch renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(QuadBatchKind)).toBe(defaultGlQuadBatchRenderer);
  });

  it('registers RenderCacheKind with the default render cache renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(RenderCacheKind)).toBe(defaultGlRenderCacheRenderer);
  });

  it('registers RichTextKind with the default rich text renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(RichTextKind)).toBe(defaultGlRichTextRenderer);
  });

  it('registers Scale9ShapeKind with the default scale9 shape renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(Scale9ShapeKind)).toBe(defaultGlScale9ShapeRenderer);
  });

  it('registers ShapeKind with the default shape renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(ShapeKind)).toBe(defaultGlShapeRenderer);
  });

  it('registers SpriteKind with the default sprite renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(SpriteKind)).toBe(defaultGlSpriteRenderer);
  });

  it('registers TextLabelKind with the default text label renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(TextLabelKind)).toBe(defaultGlTextLabelRenderer);
  });

  it('registers TilemapKind with the default tilemap renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(TilemapKind)).toBe(defaultGlTilemapRenderer);
  });

  it('registers VideoKind with the default video renderer', () => {
    const state = makeState();
    registerGlDisplayObjectRenderers(state);
    expect(getRenderStateRuntime(state).rendererMap.get(VideoKind)).toBe(defaultGlVideoRenderer);
  });
});
