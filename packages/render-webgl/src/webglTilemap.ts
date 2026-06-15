import { noopRendererData } from '@flighthq/render';
import type { RenderState, SpriteRenderer, SpriteRenderNode, Tilemap } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture } from './webglDraw';
import {
  drawWebGLQuadBatchInstanced,
  ensureWebGLQuadBatchCapacity,
  ensureWebGLQuadBatchShader,
} from './webglQuadBatch';

export function drawWebGLTilemap(state: RenderState, tilemapNode: SpriteRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = tilemapNode.source as Tilemap;
  const { tileset, columns, rows, tiles } = source.data;

  if (tileset === null) return;
  const atlas = tileset.atlas;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;
  if (columns === 0 || rows === 0) return;

  ensureWebGLQuadBatchShader(internal);
  ensureWebGLQuadBatchCapacity(internal, columns * rows);

  internal.applyBlendMode?.(internal, tilemapNode.blendMode);
  bindWebGLTexture(internal, atlas.image.src);

  const regions = atlas.regions;
  const numRegions = regions.length;
  const { tileWidth, tileHeight } = tileset;
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
      base += 12;
      drawCount++;
    }
  }

  if (drawCount === 0) return;

  drawWebGLQuadBatchInstanced(internal, drawCount, tilemapNode.transform2D, tilemapNode.alpha);
}

export const defaultWebGLTilemapRenderer: SpriteRenderer = {
  createData: noopRendererData,
  draw: drawWebGLTilemap,
};
