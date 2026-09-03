import { resolveWgpuMaterialRenderer, resolveWgpuTexture } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getTextureHeight, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import type {
  ColorScaleBias,
  QuadBatch,
  RenderProxy2D,
  SpriteRenderer,
  TintMaterialData,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  ensureWgpuQuadBatchResources,
  getWgpuQuadBatchPipeline,
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
  QUAD_BATCH_INSTANCE_FLOATS,
} from './wgpuQuadBatchWriter';

export { ensureWgpuQuadBatchResources, getWgpuQuadBatchPipeline };

// Each quad writes the 13 base instance floats; any material packs its own per-instance data into the
// parallel material buffer.
const INSTANCE_STRIDE_FLOATS = QUAD_BATCH_INSTANCE_FLOATS;

function submitWgpuQuadBatch(state: WgpuRenderState, quadBatch: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.texture === null || !hasTextureSource(atlas.texture) || instanceCount === 0) return;

  const material = quadBatch.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const texture = atlas.texture;
  const textureEntry = resolveWgpuTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (textureEntry === null) return;
  const nodeMaterialData = quadBatch.materialData;
  // Per-quad color adjustments, overriding the node-level tint for the quads that carry one.
  const perQuadColorScaleBias = data.materialData;
  const nodeColorScaleBias = quadBatch.colorScaleBias;
  const nodeColorMatrix = quadBatch.colorMatrix;
  const startInstance = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
    texture.sampler,
    quadBatch.blendMode,
    material,
    materialRenderer,
    instanceCount,
  );
  const base = startInstance * QUAD_BATCH_INSTANCE_FLOATS;

  const regions = atlas.regions;
  const numRegions = regions.length;
  const iw = 1 / Math.max(1, getTextureWidth(texture));
  const ih = 1 / Math.max(1, getTextureHeight(texture));
  const instanceData = runtime.quadBatchWriterInstanceData;
  const isVector2 = data.transformType === 'vector2';
  const pt = quadBatch.transform2D;
  const pa = pt.a,
    pb = pt.b,
    pc = pt.c,
    pd = pt.d,
    ptx = pt.tx,
    pty = pt.ty;
  const alpha = quadBatch.alpha;

  let writeBase = base;
  let drawCount = 0;
  for (let i = 0; i < instanceCount; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;
    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) continue;

    if (isVector2) {
      const dx = transforms[i * 2],
        dy = transforms[i * 2 + 1];
      instanceData[writeBase] = pa;
      instanceData[writeBase + 1] = pb;
      instanceData[writeBase + 2] = pc;
      instanceData[writeBase + 3] = pd;
      instanceData[writeBase + 4] = pa * dx + pc * dy + ptx;
      instanceData[writeBase + 5] = pb * dx + pd * dy + pty;
    } else {
      const offset = i * 6;
      const la = transforms[offset],
        lb = transforms[offset + 1];
      const lc = transforms[offset + 2],
        ld = transforms[offset + 3];
      const ltx = transforms[offset + 4],
        lty = transforms[offset + 5];
      instanceData[writeBase] = pa * la + pc * lb;
      instanceData[writeBase + 1] = pb * la + pd * lb;
      instanceData[writeBase + 2] = pa * lc + pc * ld;
      instanceData[writeBase + 3] = pb * lc + pd * ld;
      instanceData[writeBase + 4] = pa * ltx + pc * lty + ptx;
      instanceData[writeBase + 5] = pb * ltx + pd * lty + pty;
    }
    instanceData[writeBase + 6] = region.width;
    instanceData[writeBase + 7] = region.height;
    instanceData[writeBase + 8] = region.x * iw;
    instanceData[writeBase + 9] = region.y * ih;
    instanceData[writeBase + 10] = (region.x + region.width) * iw;
    instanceData[writeBase + 11] = (region.y + region.height) * ih;
    instanceData[writeBase + 12] = alpha;
    packWgpuQuadBatchMaterialInstance(state, nodeMaterialData, startInstance + drawCount);
    // Per-quad tint overrides the node-level tint (null → the node's, itself possibly null → untinted).
    const colorScaleBias =
      (perQuadColorScaleBias?.[i] as ColorScaleBias | TintMaterialData | readonly number[] | null) ??
      nodeColorMatrix ??
      nodeColorScaleBias;
    recordWgpuQuadBatchColorScaleBias(state, colorScaleBias, startInstance + drawCount);
    writeBase += INSTANCE_STRIDE_FLOATS;
    drawCount++;
  }

  runtime.quadBatchWriterCount += drawCount;
}

export const defaultWgpuQuadBatchRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitWgpuQuadBatch,
};
