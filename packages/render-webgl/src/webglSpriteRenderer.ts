import { createNullRendererData } from '@flighthq/render';
import type { RenderState, Sprite, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture, drawWebGLQuad, useWebGLProgram } from './webglDraw';
import { setWebGLBaseUniforms, setWebGLMatrixFromTransform } from './webglShader';

export function drawWebGLSpriteNode(state: RenderState, spriteNode: SpriteRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;

  const regions = atlas.regions;
  if (id < 0 || id >= regions.length) return;

  const region = regions[id];
  if (region.width <= 0 || region.height <= 0) return;

  useWebGLProgram(internal);
  internal.applyBlendMode?.(internal, spriteNode.blendMode);
  bindWebGLTexture(internal, atlas.image.src);

  const gl = internal.gl;
  const { shaderLoc, matrixArray } = internal;

  setWebGLBaseUniforms(gl, shaderLoc, spriteNode);
  setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, spriteNode.transform2D, internal.canvas);

  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const u0 = region.x * iw;
  const v0 = region.y * ih;
  const u1 = (region.x + region.width) * iw;
  const v1 = (region.y + region.height) * ih;

  drawWebGLQuad(internal, 0, 0, region.width, region.height, u0, v0, u1, v1);
}

export const defaultWebGLSpriteRenderer: SpriteRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLSpriteNode,
};
