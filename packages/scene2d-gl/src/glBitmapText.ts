import { getGlRenderStateRuntime, resolveGlMaterialRenderer, resolveGlTexture } from '@flighthq/render-gl/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import type {
  BitmapText,
  BitmapTextRuntime,
  GlRenderState,
  RenderProxy2D,
  SpriteRenderer,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  QUAD_BATCH_INSTANCE_FLOATS,
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
  writeGlQuadBatchAffineInstance,
} from './glQuadBatchWriter';

// Per-instance stride, matching the QuadBatch/Tilemap sprite path (13 floats: world transform + region +
// uv + alpha). See glQuadBatch.

// Draws a BitmapText leaf: one batched sprite pass per glyph-atlas page (each page binds its own atlas
// image, so a multi-page source issues one draw per page). The node's resolved color adjustment folds in
// as a whole-node tint on every glyph — the same `recordGlQuadBatchColorScaleBias` path a tinted
// QuadBatch uses — realized only when `registerGlColorAdjustmentMaterialFeature` has installed the fold. Mirrors
// `submitGlQuadBatch`'s vector2 inner loop, sourced from the page's own `ids`/`transforms` arrays.
function submitGlBitmapText(state: GlRenderState, node: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = node.source as BitmapText;
  const pages = (getNode2DRuntime(source) as BitmapTextRuntime).pages;

  const material = node.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const nodeMaterialData = node.materialData;
  const nodeColorScaleBias = node.colorMatrix ?? node.colorScaleBias;
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
    const texture = atlas.texture;
    if (texture === null || !hasTextureSource(texture) || page.instanceCount === 0) continue;

    const glTexture = resolveGlTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
    if (glTexture === null) continue;
    const straightAlpha = runtime.context.currentTextureRealization!.straightAlpha;
    ensureGlQuadBatchShader(state);
    // prepareGlQuadBatchWrite may flush the prior page's batch (each page binds a different image), so
    // read the running instance count AFTER it so material/color-adjustment indices align with `base`.
    const startInstance = prepareGlQuadBatchWrite(
      state,
      glTexture,
      straightAlpha,
      texture.sampler,
      node.blendMode,
      material,
      materialRenderer,
      page.instanceCount,
    );
    const base = startInstance * QUAD_BATCH_INSTANCE_FLOATS;

    const regions = atlas.regions;
    const numRegions = regions.length;
    const iw = 1 / Math.max(1, getTextureWidth(texture));
    const ih = 1 / Math.max(1, getTextureHeight(texture));
    const instanceData = runtime.quadBatchWriterInstanceData;
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
      glyphTransform.a = pa;
      glyphTransform.b = pb;
      glyphTransform.c = pc;
      glyphTransform.d = pd;
      glyphTransform.tx = pa * dx + pc * dy + ptx;
      glyphTransform.ty = pb * dx + pd * dy + pty;
      const u0 = region.x * iw;
      const v0 = region.y * ih;
      const u1 = (region.x + region.width) * iw;
      const v1 = (region.y + region.height) * ih;
      writeGlQuadBatchAffineInstance(
        instanceData,
        writeBase,
        glyphTransform,
        region.rotated ? region.height : region.width,
        region.rotated ? region.width : region.height,
        u0,
        region.rotated ? v1 : v0,
        region.rotated ? 0 : u1 - u0,
        region.rotated ? v0 - v1 : 0,
        region.rotated ? u1 - u0 : 0,
        region.rotated ? 0 : v1 - v0,
        alpha,
      );
      packGlQuadBatchMaterialInstance(state, nodeMaterialData, startInstance + drawCount);
      recordGlQuadBatchColorScaleBias(state, nodeColorScaleBias, startInstance + drawCount);
      writeBase += QUAD_BATCH_INSTANCE_FLOATS;
      drawCount++;
    }

    runtime.quadBatchWriterCount += drawCount;
  }
}

export const defaultGlBitmapTextRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitGlBitmapText,
};

const glyphTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
