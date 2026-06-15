import { noopRendererData } from '@flighthq/render';
import type { RenderState, SpriteRenderer, SpriteRenderNode, Tilemap } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture, drawWebGPUQuadWithTransform } from './webgpuDraw';

export function drawWebGPUTilemap(state: RenderState, tilemapNode: SpriteRenderNode): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = tilemapNode.source as Tilemap;
  const { columns, rows, tileset, tiles } = source.data;

  if (tileset === null) return;
  const atlas = tileset.atlas;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;
  if (columns === 0 || rows === 0) return;

  internal.applyBlendMode?.(internal, tilemapNode.blendMode);

  const textureEntry = bindWebGPUTexture(internal, atlas.image.src);
  const regions = atlas.regions;
  const numRegions = regions.length;
  const transform = tilemapNode.transform2D;
  const { tileHeight, tileWidth } = tileset;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const id = tiles[row * columns + col];
      if (id < 0 || id >= numRegions) continue;

      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const dx = col * tileWidth;
      const dy = row * tileHeight;

      const u0 = region.x * iw;
      const v0 = region.y * ih;
      const u1 = (region.x + region.width) * iw;
      const v1 = (region.y + region.height) * ih;

      drawWebGPUQuadWithTransform(
        internal,
        tilemapNode,
        {
          a: transform.a,
          b: transform.b,
          c: transform.c,
          d: transform.d,
          tx: transform.tx + transform.a * dx + transform.c * dy,
          ty: transform.ty + transform.b * dx + transform.d * dy,
        },
        textureEntry,
        0,
        0,
        tileWidth,
        tileHeight,
        u0,
        v0,
        u1,
        v1,
      );
    }
  }
}

export const defaultWebGPUTilemapRenderer: SpriteRenderer = {
  createData: noopRendererData,
  draw: drawWebGPUTilemap,
};
