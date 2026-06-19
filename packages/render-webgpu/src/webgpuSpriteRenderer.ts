import { noopRendererData } from '@flighthq/render';
import type { RenderProxy2D, Sprite, SpriteRenderer, WebGPURenderState } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { resolveWebGPUMaterialRenderer } from './webgpuMaterialRegistry';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { packWebGPUSpriteBatchMaterialInstance, prepareWebGPUSpriteBatchWrite } from './webgpuSpriteBatch';

function submitWebGPUSpriteNode(state: WebGPURenderState, spriteNode: RenderProxy2D): void {
  const runtime = getWebGPURenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.source === null) return;

  const regions = atlas.regions;
  if (id < 0 || id >= regions.length) return;

  const region = regions[id];
  if (region.width <= 0 || region.height <= 0) return;

  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const t = spriteNode.transform2D;

  const material = spriteNode.material;
  const materialRenderer = resolveWebGPUMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const base = prepareWebGPUSpriteBatchWrite(
    state,
    atlas.image.source,
    spriteNode.blendMode,
    material,
    materialRenderer,
    1,
  );
  const instanceIndex = runtime.spriteBatchCount;
  const d = runtime.spriteBatchInstanceData;
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
  packWebGPUSpriteBatchMaterialInstance(state, spriteNode.materialData, instanceIndex);
  runtime.spriteBatchCount++;
}

export const defaultWebGPUSpriteRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitWebGPUSpriteNode,
};
