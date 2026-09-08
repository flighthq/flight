import { resolveWgpuMaterialRenderer, resolveWgpuTexture } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getTextureHeight, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import type {
  ColorScaleBias,
  RenderProxy2D,
  SpriteRenderer,
  Tilemap,
  TintMaterialData,
  WgpuRenderState,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
  writeWgpuQuadBatchAffineInstance,
  QUAD_BATCH_INSTANCE_FLOATS,
} from './wgpuQuadBatchWriter';

// Each tile writes the 13 base instance floats; any material packs its own per-instance data.
const INSTANCE_STRIDE_FLOATS = QUAD_BATCH_INSTANCE_FLOATS;

function submitWgpuTilemap(state: WgpuRenderState, tilemapNode: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = tilemapNode.source as Tilemap;
  const { atlas, columns, rows, tileHeight, tileWidth, tiles } = source.data;

  if (atlas === null || atlas.texture === null || !hasTextureSource(atlas.texture)) return;
  if (columns === 0 || rows === 0) return;

  const material = tilemapNode.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const texture = atlas.texture;
  const textureEntry = resolveWgpuTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (textureEntry === null) return;
  const nodeMaterialData = tilemapNode.materialData;
  // Per-tile color adjustments, overriding the node-level tint for the tiles that carry one.
  const perTileColorScaleBias = source.data.materialData;
  const nodeColorScaleBias = tilemapNode.colorScaleBias;
  const nodeColorMatrix = tilemapNode.colorMatrix;
  const startInstance = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
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
      const counterclockwise = region.rotationDirection === 'counterclockwise';
      writeWgpuQuadBatchAffineInstance(
        instanceData,
        writeBase,
        tileTransform,
        tileWidth,
        tileHeight,
        region.rotated ? (counterclockwise ? u0 : u1) : u0,
        region.rotated && counterclockwise ? v1 : v0,
        region.rotated ? 0 : u1 - u0,
        region.rotated ? (counterclockwise ? v0 - v1 : v1 - v0) : 0,
        region.rotated ? (counterclockwise ? u1 - u0 : u0 - u1) : 0,
        region.rotated ? 0 : v1 - v0,
        alpha,
      );
      packWgpuQuadBatchMaterialInstance(state, nodeMaterialData, startInstance + drawCount);
      // Per-tile tint overrides the node-level tint (null → the node's, itself possibly null → untinted).
      const colorScaleBias =
        (perTileColorScaleBias?.[row * columns + col] as
          | ColorScaleBias
          | TintMaterialData
          | readonly number[]
          | null) ??
        nodeColorMatrix ??
        nodeColorScaleBias;
      recordWgpuQuadBatchColorScaleBias(state, colorScaleBias, startInstance + drawCount);
      writeBase += INSTANCE_STRIDE_FLOATS;
      drawCount++;
    }
  }

  runtime.quadBatchWriterCount += drawCount;
}

export const defaultWgpuTilemapRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitWgpuTilemap,
};

const tileTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
