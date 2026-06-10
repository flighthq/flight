import { createNullRendererData } from '@flighthq/render';
import type { ParticleEmitter, RenderState, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture, drawWebGLQuad, useWebGLProgram } from './webglDraw';
import { setWebGLMatrixFromValues } from './webglShader';

export function drawWebGLParticleEmitter(state: RenderState, renderNode: SpriteRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as ParticleEmitter;
  const { atlas, alphas, ids, particleCount, transforms } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null || particleCount === 0) return;

  useWebGLProgram(internal);
  internal.applyBlendMode?.(internal, renderNode.blendMode);
  bindWebGLTexture(internal, atlas.image.src);

  const gl = internal.gl;
  const { shaderLoc, matrixArray } = internal;
  const regions = atlas.regions;
  const numRegions = regions.length;
  const nodeAlpha = renderNode.alpha;
  const t = renderNode.transform2D;
  const viewport = internal.renderTargetViewport ?? internal.canvas;

  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);

  gl.uniform1i(shaderLoc.locTexture, 0);

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

    // Build world matrix: node transform × particle local (scale+rotate+translate)
    const cosR = Math.cos(rotation) * scale;
    const sinR = Math.sin(rotation) * scale;

    // particleLocal = [cosR, sinR, -sinR, cosR, px, py]
    // world = t * particleLocal
    const a = t.a * cosR + t.c * sinR;
    const b = t.b * cosR + t.d * sinR;
    const c = t.a * -sinR + t.c * cosR;
    const d = t.b * -sinR + t.d * cosR;
    const tx = t.a * px + t.c * py + t.tx;
    const ty = t.b * px + t.d * py + t.ty;

    setWebGLMatrixFromValues(gl, shaderLoc, matrixArray, a, b, c, d, tx, ty, viewport);
    gl.uniform1f(shaderLoc.locAlpha, nodeAlpha * alphas[i]);

    const u0 = region.x * iw;
    const v0 = region.y * ih;
    const u1 = (region.x + region.width) * iw;
    const v1 = (region.y + region.height) * ih;

    drawWebGLQuad(internal, 0, 0, region.width, region.height, u0, v0, u1, v1);
  }
}

export const defaultWebGLParticleEmitterRenderer: SpriteRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLParticleEmitter,
};
