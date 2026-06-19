import { noopRendererData } from '@flighthq/render';
import type { QuadBatch, RenderProxy2D, SpriteRenderer, WebGPURenderState } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { resolveWebGPUMaterialRenderer } from './webgpuMaterialRegistry';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import {
  ensureWebGPUQuadBatchResources,
  getWebGPUQuadBatchPipeline,
  packWebGPUSpriteBatchMaterialInstance,
  prepareWebGPUSpriteBatchWrite,
  SPRITE_INSTANCE_FLOATS,
  type WebGPUQuadBatchResources,
} from './webgpuSpriteBatch';

export type { WebGPUQuadBatchResources };
export { ensureWebGPUQuadBatchResources, getWebGPUQuadBatchPipeline };

// Each quad writes the 13 base instance floats; any material packs its own per-instance data into the
// parallel material buffer.
const INSTANCE_STRIDE_FLOATS = SPRITE_INSTANCE_FLOATS;

function submitWebGPUQuadBatch(state: WebGPURenderState, quadBatch: RenderProxy2D): void {
  const runtime = getWebGPURenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.image === null || atlas.image.source === null || instanceCount === 0) return;

  const material = quadBatch.material;
  const materialRenderer = resolveWebGPUMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const perQuadMaterialData = data.materialData;
  const nodeMaterialData = quadBatch.materialData;
  const startCount = runtime.spriteBatchCount;
  const base = prepareWebGPUSpriteBatchWrite(
    state,
    atlas.image.source,
    quadBatch.blendMode,
    material,
    materialRenderer,
    instanceCount,
  );

  const regions = atlas.regions;
  const numRegions = regions.length;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const instanceData = runtime.spriteBatchInstanceData;
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
    const md = perQuadMaterialData?.[i] ?? nodeMaterialData;
    packWebGPUSpriteBatchMaterialInstance(state, md, startCount + drawCount);
    writeBase += INSTANCE_STRIDE_FLOATS;
    drawCount++;
  }

  runtime.spriteBatchCount += drawCount;
}

export const defaultWebGPUQuadBatchRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitWebGPUQuadBatch,
};
