import { noopRendererData } from '@flighthq/render/contract';
import type { CanvasRenderState, ParticleEmitter2D, RenderProxy2D, SpriteRenderer } from '@flighthq/types/contract';

import { resolveCanvasTexture } from './canvasImageSource';

// Canvas 2D does not support per-pixel color multiplication, so only alpha
// and transform (position, rotation, scale) are applied. Color tint values
// from the emitter config are silently ignored. Use the Gl renderer for
// full color-over-lifetime support.
export function drawCanvasParticleEmitter2D(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  const source = renderProxy.source as ParticleEmitter2D;
  const { atlas, alphas, ids, particleCount, transforms } = source.data;
  if (atlas === null || atlas.texture === null || particleCount === 0) return;
  const imageSource = resolveCanvasTexture(state, atlas.texture);
  if (imageSource === null) return;

  const regions = atlas.regions;
  const numRegions = regions.length;
  const nodeAlpha = renderProxy.alpha;
  const t = renderProxy.transform2D;
  const context = state.context;

  state.applyBlendMode?.(state, renderProxy.blendMode);

  const smoothing = state.allowSmoothing && !atlas.texture.sampler.magFilter.startsWith('nearest');
  if (!smoothing) context.imageSmoothingEnabled = false;

  for (let i = 0; i < particleCount; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;
    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) continue;

    const tt = i * 4;
    const px = transforms[tt];
    const py = transforms[tt + 1];
    const rotation = transforms[tt + 2];
    const scale = transforms[tt + 3];

    // Build world matrix. In world-space mode particle positions are already in
    // world (pixel) space, so we skip the node transform.
    const cosR = Math.cos(rotation) * scale;
    const sinR = Math.sin(rotation) * scale;
    let a: number, b: number, c: number, d: number, tx: number, ty: number;
    if (source.data.worldSpace) {
      a = cosR;
      b = sinR;
      c = -sinR;
      d = cosR;
      tx = px;
      ty = py;
    } else {
      a = t.a * cosR + t.c * sinR;
      b = t.b * cosR + t.d * sinR;
      c = t.a * -sinR + t.c * cosR;
      d = t.b * -sinR + t.d * cosR;
      tx = t.a * px + t.c * py + t.tx;
      ty = t.b * px + t.d * py + t.ty;
    }

    context.globalAlpha = nodeAlpha * alphas[i];
    context.setTransform(a, b, c, d, tx, ty);
    context.drawImage(imageSource, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
  }

  if (!smoothing) context.imageSmoothingEnabled = true;
}

export const defaultCanvasParticleEmitter2DRenderer: SpriteRenderer = {
  createData: noopRendererData,
  submit: drawCanvasParticleEmitter2D,
};
