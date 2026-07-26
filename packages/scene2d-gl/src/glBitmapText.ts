import { hasImageResourcePixels } from '@flighthq/image';
import { noopRendererData } from '@flighthq/render';
import { getGlRenderStateRuntime, resolveGlMaterialRenderer } from '@flighthq/render-gl';
import { getNode2DRuntime } from '@flighthq/scene2d';
import type { BitmapText, BitmapTextRuntime, GlRenderState, RenderProxy2D, SpriteRenderer } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import {
  ensureGlQuadBatchShader,
  packGlSpriteBatchMaterialInstance,
  prepareGlSpriteBatchWrite,
  recordGlSpriteBatchColorTransform,
} from './glSpriteBatch';

// Per-instance stride, matching the QuadBatch/Tilemap sprite path (13 floats: world transform + region +
// uv + alpha). See glQuadBatch.
const INSTANCE_FLOATS = 13;

// Draws a BitmapText leaf: one batched sprite pass per glyph-atlas page (each page binds its own atlas
// image, so a multi-page source issues one draw per page). The node's resolved color transform folds in
// as a whole-node tint on every glyph — the same `recordGlSpriteBatchColorTransform` path a tinted
// QuadBatch uses — realized only when `enableGlColorAdjustment` has installed the fold. Mirrors
// `submitGlQuadBatch`'s vector2 inner loop, sourced from the page's own `ids`/`transforms` arrays.
function submitGlBitmapText(state: GlRenderState, node: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = node.source as BitmapText;
  const pages = (getNode2DRuntime(source) as BitmapTextRuntime).pages;

  const material = node.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const nodeMaterialData = node.materialData;
  const nodeColorTransform = node.colorTransform;
  const pt = node.transform2D;
  const pa = pt.a;
  const pb = pt.b;
  const pc = pt.c;
  const pd = pt.d;
  const ptx = pt.tx;
  const pty = pt.ty;
  const alpha = node.alpha;

  for (const page of pages) {
    const atlas = page.atlas;
    const image = atlas.image;
    if (image === null || !hasImageResourcePixels(image) || page.instanceCount === 0) continue;

    ensureGlQuadBatchShader(state);
    // prepareGlSpriteBatchWrite may flush the prior page's batch (each page binds a different image), so
    // read the running instance count AFTER it so material/color-transform indices align with `base`.
    const base = prepareGlSpriteBatchWrite(
      state,
      image,
      node.blendMode,
      material,
      materialRenderer,
      page.instanceCount,
    );
    const startCount = runtime.spriteBatchCount;

    const regions = atlas.regions;
    const numRegions = regions.length;
    const iw = 1 / (image.width || 1);
    const ih = 1 / (image.height || 1);
    const instanceData = runtime.spriteBatchInstanceData;
    const ids = page.ids;
    const transforms = page.transforms;

    let writeBase = base;
    let drawCount = 0;
    for (let i = 0; i < page.instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const dx = transforms[i * 2];
      const dy = transforms[i * 2 + 1];
      instanceData[writeBase] = pa;
      instanceData[writeBase + 1] = pb;
      instanceData[writeBase + 2] = pc;
      instanceData[writeBase + 3] = pd;
      instanceData[writeBase + 4] = pa * dx + pc * dy + ptx;
      instanceData[writeBase + 5] = pb * dx + pd * dy + pty;
      instanceData[writeBase + 6] = region.width;
      instanceData[writeBase + 7] = region.height;
      instanceData[writeBase + 8] = region.x * iw;
      instanceData[writeBase + 9] = region.y * ih;
      instanceData[writeBase + 10] = (region.x + region.width) * iw;
      instanceData[writeBase + 11] = (region.y + region.height) * ih;
      instanceData[writeBase + 12] = alpha;
      packGlSpriteBatchMaterialInstance(state, nodeMaterialData, startCount + drawCount);
      recordGlSpriteBatchColorTransform(state, nodeColorTransform, startCount + drawCount);
      writeBase += INSTANCE_FLOATS;
      drawCount++;
    }

    runtime.spriteBatchCount += drawCount;
  }
}

export const defaultGlBitmapTextRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitGlBitmapText,
};
