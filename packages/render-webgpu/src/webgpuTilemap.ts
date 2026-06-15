import { noopRendererData } from '@flighthq/render';
import type { RenderState, SpriteRenderer, SpriteRenderNode, Tilemap } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { prepareWebGPUSpriteBatchWrite } from './webgpuSpriteBatch';

const INSTANCE_FLOATS = 13;

function submitWebGPUTilemap(state: RenderState, tilemapNode: SpriteRenderNode): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = tilemapNode.source as Tilemap;
  const { columns, rows, tileset, tiles } = source.data;

  if (tileset === null) return;
  const atlas = tileset.atlas;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;
  if (columns === 0 || rows === 0) return;

  const ct = tilemapNode.useColorTransform ? tilemapNode.colorTransform : null;
  const base = prepareWebGPUSpriteBatchWrite(internal, atlas.image.src, tilemapNode.blendMode, ct, columns * rows);

  const regions = atlas.regions;
  const numRegions = regions.length;
  const { tileHeight, tileWidth } = tileset;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const instanceData = internal.spriteBatchInstanceData;
  const pt = tilemapNode.transform2D;
  const pa = pt.a,
    pb = pt.b,
    pc = pt.c,
    pd = pt.d,
    ptx = pt.tx,
    pty = pt.ty;
  const alpha = tilemapNode.alpha;

  let writeBase = base;
  let drawCount = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const id = tiles[row * columns + col];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const dx = col * tileWidth;
      const dy = row * tileHeight;
      instanceData[writeBase] = pa;
      instanceData[writeBase + 1] = pb;
      instanceData[writeBase + 2] = pc;
      instanceData[writeBase + 3] = pd;
      instanceData[writeBase + 4] = pa * dx + pc * dy + ptx;
      instanceData[writeBase + 5] = pb * dx + pd * dy + pty;
      instanceData[writeBase + 6] = tileWidth;
      instanceData[writeBase + 7] = tileHeight;
      instanceData[writeBase + 8] = region.x * iw;
      instanceData[writeBase + 9] = region.y * ih;
      instanceData[writeBase + 10] = (region.x + region.width) * iw;
      instanceData[writeBase + 11] = (region.y + region.height) * ih;
      instanceData[writeBase + 12] = alpha;
      writeBase += INSTANCE_FLOATS;
      drawCount++;
    }
  }

  internal.spriteBatchCount += drawCount;
}

export const defaultWebGPUTilemapRenderer: SpriteRenderer = {
  createData: noopRendererData,
  submit: submitWebGPUTilemap,
};
