import { noopRendererData } from '@flighthq/render';
import { resolveGlMaterialRenderer } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { GlRenderState, RenderProxy2D, SpriteRenderer, Tilemap } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import {
  ensureGlQuadBatchShader,
  packGlSpriteBatchMaterialInstance,
  prepareGlSpriteBatchWrite,
} from './webglSpriteBatch';

const INSTANCE_FLOATS = 13;

function submitGlTilemap(state: GlRenderState, tilemapNode: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = tilemapNode.source as Tilemap;
  const { tileset, columns, rows, tiles } = source.data;

  if (tileset === null) return;
  const atlas = tileset.atlas;
  if (atlas === null || atlas.image === null || atlas.image.source === null) return;
  if (columns === 0 || rows === 0) return;

  ensureGlQuadBatchShader(state);

  const material = tilemapNode.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const nodeMaterialData = tilemapNode.materialData;
  const perTileMaterialData = source.data.materialData;
  const startCount = runtime.spriteBatchCount;
  const base = prepareGlSpriteBatchWrite(
    state,
    atlas.image.source,
    tilemapNode.blendMode,
    material,
    materialRenderer,
    columns * rows,
  );

  const regions = atlas.regions;
  const numRegions = regions.length;
  const { tileWidth, tileHeight } = tileset;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const instanceData = runtime.spriteBatchInstanceData;
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
      const md = perTileMaterialData?.[row * columns + col] ?? nodeMaterialData;
      packGlSpriteBatchMaterialInstance(state, md, startCount + drawCount);
      writeBase += INSTANCE_FLOATS;
      drawCount++;
    }
  }

  runtime.spriteBatchCount += drawCount;
}

export const defaultGlTilemapRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitGlTilemap,
};
