import { noopRendererData } from '@flighthq/render';
import type { RenderState, Sprite, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { ensureWebGLQuadBatchShader, prepareWebGLSpriteBatchWrite } from './webglSpriteBatch';

function submitWebGLSpriteNode(state: RenderState, spriteNode: SpriteRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;

  const regions = atlas.regions;
  if (id < 0 || id >= regions.length) return;

  const region = regions[id];
  if (region.width <= 0 || region.height <= 0) return;

  ensureWebGLQuadBatchShader(internal);

  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const t = spriteNode.transform2D;

  const ct = spriteNode.useColorTransform ? spriteNode.colorTransform : null;
  const base = prepareWebGLSpriteBatchWrite(internal, atlas.image.src, spriteNode.blendMode, ct, 1);
  const d = internal.spriteBatchInstanceData;
  d[base] = t.a;
  d[base + 1] = t.b;
  d[base + 2] = t.c;
  d[base + 3] = t.d;
  d[base + 4] = t.tx;
  d[base + 5] = t.ty;
  d[base + 6] = region.width;
  d[base + 7] = region.height;
  d[base + 8] = region.x * iw;
  d[base + 9] = region.y * ih;
  d[base + 10] = (region.x + region.width) * iw;
  d[base + 11] = (region.y + region.height) * ih;
  d[base + 12] = spriteNode.alpha;
  internal.spriteBatchCount++;
}

export const defaultWebGLSpriteRenderer: SpriteRenderer = {
  createData: noopRendererData,
  submit: submitWebGLSpriteNode,
};
