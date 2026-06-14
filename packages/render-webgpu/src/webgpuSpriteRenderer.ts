import { noopRendererData } from '@flighthq/render';
import type { RenderState, Sprite, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture, drawWebGPUQuadWithTransform } from './webgpuDraw';

export function drawWebGPUSpriteNode(state: RenderState, spriteNode: SpriteRenderNode): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;

  const regions = atlas.regions;
  if (id < 0 || id >= regions.length) return;

  const region = regions[id];
  if (region.width <= 0 || region.height <= 0) return;

  internal.applyBlendMode?.(internal, spriteNode.blendMode);
  const textureEntry = bindWebGPUTexture(internal, atlas.image.src);

  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const u0 = region.x * iw;
  const v0 = region.y * ih;
  const u1 = (region.x + region.width) * iw;
  const v1 = (region.y + region.height) * ih;

  drawWebGPUQuadWithTransform(
    internal,
    spriteNode,
    spriteNode.transform2D,
    textureEntry,
    0,
    0,
    region.width,
    region.height,
    u0,
    v0,
    u1,
    v1,
  );
}

export const defaultWebGPUSpriteRenderer: SpriteRenderer = {
  createData: noopRendererData,
  draw: drawWebGPUSpriteNode,
};
