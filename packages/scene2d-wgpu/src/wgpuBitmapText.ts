import {
  getWgpuRenderStateRuntime,
  resolveWgpuMaterialRenderer,
  resolveWgpuTexture,
} from '@flighthq/render-wgpu/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import type {
  BitmapText,
  BitmapTextRuntime,
  RenderProxy2D,
  SpriteRenderer,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { BatchFormat, TextureAtlasRotation } from '@flighthq/types/contract';

import {
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
  writeWgpuQuadBatchAffineInstance,
  QUAD_BATCH_INSTANCE_FLOATS,
} from './wgpuQuadBatchWriter';

const INSTANCE_STRIDE_FLOATS = QUAD_BATCH_INSTANCE_FLOATS;

// Draws a BitmapText leaf on WebGPU: one batched sprite pass per glyph-atlas page. The node's resolved
// color adjustment folds in as a whole-node tint on every glyph (the same
// `recordWgpuQuadBatchColorScaleBias` path a tinted QuadBatch uses). Mirrors `submitWgpuQuadBatch`'s
// vector2 inner loop, sourced from each page's own `ids`/`transforms` arrays.
function submitWgpuBitmapText(state: WgpuRenderState, node: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = node.source as BitmapText;
  const pages = (getNode2DRuntime(source) as BitmapTextRuntime).pages;

  const material = node.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
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
    const textureEntry = resolveWgpuTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
    if (textureEntry === null) continue;

    // prepareWgpuQuadBatchWrite may flush the prior page's batch (each page binds a different image),
    // so read the running instance count AFTER it so material/color-adjustment indices align with `base`.
    const startInstance = prepareWgpuQuadBatchWrite(
      state,
      textureEntry,
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
      const rotated = region.rotation !== TextureAtlasRotation.None;
      const counterclockwise = region.rotation === TextureAtlasRotation.Counterclockwise90;
      writeWgpuQuadBatchAffineInstance(
        instanceData,
        writeBase,
        glyphTransform,
        rotated ? region.height : region.width,
        rotated ? region.width : region.height,
        rotated ? (counterclockwise ? u0 : u1) : u0,
        rotated && counterclockwise ? v1 : v0,
        rotated ? 0 : u1 - u0,
        rotated ? (counterclockwise ? v0 - v1 : v1 - v0) : 0,
        rotated ? (counterclockwise ? u1 - u0 : u0 - u1) : 0,
        rotated ? 0 : v1 - v0,
        alpha,
      );
      packWgpuQuadBatchMaterialInstance(state, nodeMaterialData, startInstance + drawCount);
      recordWgpuQuadBatchColorScaleBias(state, nodeColorScaleBias, startInstance + drawCount);
      writeBase += INSTANCE_STRIDE_FLOATS;
      drawCount++;
    }

    runtime.quadBatchWriterCount += drawCount;
  }
}

export const defaultWgpuBitmapTextRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitWgpuBitmapText,
};

const glyphTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
