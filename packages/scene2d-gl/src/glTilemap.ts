import { resolveGlMaterialRenderer } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getTextureHeight, getTextureWidth, hasTextureBacking } from '@flighthq/texture/contract';
import type {
  ColorScaleBias,
  GlRenderState,
  RenderProxy2D,
  SpriteRenderer,
  Tilemap,
  TintMaterialData,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  ensureGlQuadBatchShader,
  packGlSpriteBatchMaterialInstance,
  prepareGlSpriteBatchWrite,
  recordGlSpriteBatchColorScaleBias,
} from './glSpriteBatch';

const INSTANCE_FLOATS = 13;

function submitGlTilemap(state: GlRenderState, tilemapNode: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = tilemapNode.source as Tilemap;
  const { atlas, columns, rows, tileHeight, tileWidth, tiles } = source.data;

  if (atlas === null || atlas.texture === null || !hasTextureBacking(atlas.texture)) return;
  if (columns === 0 || rows === 0) return;

  ensureGlQuadBatchShader(state);

  const material = tilemapNode.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const nodeMaterialData = tilemapNode.materialData;
  // Per-tile color adjustments, overriding the node-level tint for the tiles that carry one.
  const perTileColorScaleBias = source.data.materialData;
  const nodeColorScaleBias = tilemapNode.colorScaleBias;
  const nodeColorMatrix = tilemapNode.colorMatrix;
  const startCount = runtime.spriteBatchCount;
  const base = prepareGlSpriteBatchWrite(
    state,
    atlas.texture,
    tilemapNode.blendMode,
    material,
    materialRenderer,
    columns * rows,
  );

  const regions = atlas.regions;
  const numRegions = regions.length;
  const iw = 1 / Math.max(1, getTextureWidth(atlas.texture));
  const ih = 1 / Math.max(1, getTextureHeight(atlas.texture));
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
      packGlSpriteBatchMaterialInstance(state, nodeMaterialData, startCount + drawCount);
      // Per-tile tint overrides the node-level tint (null → the node's, itself possibly null → untinted).
      const colorScaleBias =
        (perTileColorScaleBias?.[row * columns + col] as
          | ColorScaleBias
          | TintMaterialData
          | readonly number[]
          | null) ??
        nodeColorMatrix ??
        nodeColorScaleBias;
      recordGlSpriteBatchColorScaleBias(state, colorScaleBias, startCount + drawCount);
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
