import { noopRendererData } from '@flighthq/render';
import type { RenderState, SpriteRenderer, SpriteRenderNode, Tilemap } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture } from './webgpuDraw';
import {
  ensureWebGPUQuadBatchInstanceBuffer,
  ensureWebGPUQuadBatchResources,
  getWebGPUQuadBatchPipeline,
} from './webgpuQuadBatch';
import { buildWebGPUMatrixFromTransform } from './webgpuShader';

// Per-instance layout matches webgpuQuadBatch: 12 floats = 48 bytes.
const INSTANCE_FLOATS = 12;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

export function drawWebGPUTilemap(state: RenderState, tilemapNode: SpriteRenderNode): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = tilemapNode.source as Tilemap;
  const { columns, rows, tileset, tiles } = source.data;

  if (tileset === null) return;
  const atlas = tileset.atlas;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;
  if (columns === 0 || rows === 0) return;

  const resources = ensureWebGPUQuadBatchResources(internal);
  ensureWebGPUQuadBatchInstanceBuffer(internal, columns * rows);

  internal.applyBlendMode?.(internal, tilemapNode.blendMode);
  const textureEntry = bindWebGPUTexture(internal, atlas.image.src);

  const regions = atlas.regions;
  const numRegions = regions.length;
  const { tileHeight, tileWidth } = tileset;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const instanceData = internal.quadBatchInstanceData!;

  let base = 0;
  let drawCount = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const id = tiles[row * columns + col];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      instanceData[base] = 1;
      instanceData[base + 1] = 0;
      instanceData[base + 2] = 0;
      instanceData[base + 3] = 1;
      instanceData[base + 4] = col * tileWidth;
      instanceData[base + 5] = row * tileHeight;
      instanceData[base + 6] = tileWidth;
      instanceData[base + 7] = tileHeight;
      instanceData[base + 8] = region.x * iw;
      instanceData[base + 9] = region.y * ih;
      instanceData[base + 10] = (region.x + region.width) * iw;
      instanceData[base + 11] = (region.y + region.height) * ih;
      base += INSTANCE_FLOATS;
      drawCount++;
    }
  }

  if (drawCount === 0) return;

  const { device } = internal;
  device.queue.writeBuffer(internal.quadBatchInstanceBuffer!, 0, instanceData.buffer, 0, drawCount * INSTANCE_STRIDE);

  const uniformOffset = internal.uniformOffset;
  const floatBase = uniformOffset >> 2;
  const { uniformData, uniformDataU32, matrixArray } = internal;
  const viewport = internal.renderTargetViewport ?? internal.canvas;

  buildWebGPUMatrixFromTransform(matrixArray, tilemapNode.transform2D, viewport);

  uniformData[floatBase + 0] = matrixArray[0];
  uniformData[floatBase + 1] = matrixArray[1];
  uniformData[floatBase + 2] = matrixArray[2];
  uniformData[floatBase + 3] = 0;
  uniformData[floatBase + 4] = matrixArray[3];
  uniformData[floatBase + 5] = matrixArray[4];
  uniformData[floatBase + 6] = matrixArray[5];
  uniformData[floatBase + 7] = 0;
  uniformData[floatBase + 8] = matrixArray[6];
  uniformData[floatBase + 9] = matrixArray[7];
  uniformData[floatBase + 10] = matrixArray[8];
  uniformData[floatBase + 11] = 0;
  uniformData[floatBase + 12] = tilemapNode.alpha;
  uniformDataU32[floatBase + 13] = 0;
  for (let k = 14; k < 32; k++) uniformData[floatBase + k] = 0;
  internal.uniformOffset += internal.uniformStride;

  const instanceBindGroup = device.createBindGroup({
    layout: resources.instanceBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: internal.quadBatchInstanceBuffer! } }],
  });

  const pipeline = getWebGPUQuadBatchPipeline(internal, resources, tilemapNode.blendMode);
  const pass = internal.renderPass!;
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, internal.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  pass.setBindGroup(2, instanceBindGroup);
  if (internal.currentMaskDepth > 0) pass.setStencilReference(internal.currentMaskDepth);
  pass.draw(6, drawCount, 0, 0);
}

export const defaultWebGPUTilemapRenderer: SpriteRenderer = {
  createData: noopRendererData,
  draw: drawWebGPUTilemap,
};
