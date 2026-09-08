import { resolveGlMaterialRenderer, resolveGlTexture } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getTextureHeight, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
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
  QUAD_BATCH_INSTANCE_FLOATS,
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
  writeGlQuadBatchAffineInstance,
} from './glQuadBatchWriter';

function submitGlTilemap(state: GlRenderState, tilemapNode: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = tilemapNode.source as Tilemap;
  const { atlas, columns, rows, tileHeight, tileWidth, tiles } = source.data;

  if (atlas === null || atlas.texture === null || !hasTextureSource(atlas.texture)) return;
  if (columns === 0 || rows === 0) return;

  ensureGlQuadBatchShader(state);

  const material = tilemapNode.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const texture = atlas.texture;
  const glTexture = resolveGlTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (glTexture === null) return;
  const straightAlpha = runtime.context.currentTextureRealization!.straightAlpha;
  const nodeMaterialData = tilemapNode.materialData;
  // Per-tile color adjustments, overriding the node-level tint for the tiles that carry one.
  const perTileColorScaleBias = source.data.materialData;
  const nodeColorScaleBias = tilemapNode.colorScaleBias;
  const nodeColorMatrix = tilemapNode.colorMatrix;
  const startInstance = prepareGlQuadBatchWrite(
    state,
    glTexture,
    straightAlpha,
    texture.sampler,
    tilemapNode.blendMode,
    material,
    materialRenderer,
    columns * rows,
  );
  const base = startInstance * QUAD_BATCH_INSTANCE_FLOATS;

  const regions = atlas.regions;
  const numRegions = regions.length;
  const iw = 1 / Math.max(1, getTextureWidth(texture));
  const ih = 1 / Math.max(1, getTextureHeight(texture));
  const instanceData = runtime.quadBatchWriterInstanceData;
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
      tileTransform.a = pa;
      tileTransform.b = pb;
      tileTransform.c = pc;
      tileTransform.d = pd;
      tileTransform.tx = pa * dx + pc * dy + ptx;
      tileTransform.ty = pb * dx + pd * dy + pty;
      const u0 = region.x * iw;
      const v0 = region.y * ih;
      const u1 = (region.x + region.width) * iw;
      const v1 = (region.y + region.height) * ih;
      writeGlQuadBatchAffineInstance(
        instanceData,
        writeBase,
        tileTransform,
        tileWidth,
        tileHeight,
        u0,
        region.rotated ? v1 : v0,
        region.rotated ? 0 : u1 - u0,
        region.rotated ? v0 - v1 : 0,
        region.rotated ? u1 - u0 : 0,
        region.rotated ? 0 : v1 - v0,
        alpha,
      );
      packGlQuadBatchMaterialInstance(state, nodeMaterialData, startInstance + drawCount);
      // Per-tile tint overrides the node-level tint (null → the node's, itself possibly null → untinted).
      const colorScaleBias =
        (perTileColorScaleBias?.[row * columns + col] as
          | ColorScaleBias
          | TintMaterialData
          | readonly number[]
          | null) ??
        nodeColorMatrix ??
        nodeColorScaleBias;
      recordGlQuadBatchColorScaleBias(state, colorScaleBias, startInstance + drawCount);
      writeBase += QUAD_BATCH_INSTANCE_FLOATS;
      drawCount++;
    }
  }

  runtime.quadBatchWriterCount += drawCount;
}

export const defaultGlTilemapRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitGlTilemap,
};

const tileTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
