import { noopRendererData } from '@flighthq/render';
import type { CanvasRenderState, SpriteRenderer, SpriteRenderNode, Tilemap } from '@flighthq/types';

export function drawCanvasTilemap(state: CanvasRenderState, tilemapNode: SpriteRenderNode): void {
  const source = tilemapNode.source as Tilemap;
  const { tileset, columns, rows, tiles } = source.data;

  if (tileset === null) return;
  const atlas = tileset.atlas;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;
  if (columns === 0 || rows === 0) return;

  state.applyBlendMode?.(state, tilemapNode.blendMode);

  const context = state.context;
  const image = atlas.image.src;
  const regions = atlas.regions;
  const numRegions = regions.length;
  const transform = tilemapNode.transform2D;
  const roundPixels = state.roundPixels;
  const { tileWidth, tileHeight } = tileset;

  context.globalAlpha = tilemapNode.alpha;
  if (!state.allowSmoothing) context.imageSmoothingEnabled = false;

  // Apply the node's world transform once â€” tile positions are local offsets within it.
  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const id = tiles[row * columns + col];
      if (id < 0 || id >= numRegions) continue;

      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const dx = col * tileWidth;
      const dy = row * tileHeight;

      context.drawImage(
        image,
        region.x,
        region.y,
        region.width,
        region.height,
        roundPixels ? dx | 0 : dx,
        roundPixels ? dy | 0 : dy,
        region.width,
        region.height,
      );
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  if (!state.allowSmoothing) context.imageSmoothingEnabled = true;
}

export const defaultCanvasTilemapRenderer: SpriteRenderer = {
  createData: noopRendererData,
  draw: drawCanvasTilemap,
};
