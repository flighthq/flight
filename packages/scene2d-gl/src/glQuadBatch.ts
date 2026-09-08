import { resolveGlMaterialRenderer, resolveGlTexture } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getTextureHeight, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import { TextureAtlasRotation } from '@flighthq/types/contract';
import type {
  ColorScaleBias,
  GlRenderState,
  QuadBatch,
  RenderProxy2D,
  SpriteRenderer,
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

function submitGlQuadBatch(state: GlRenderState, quadBatch: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.texture === null || !hasTextureSource(atlas.texture) || instanceCount === 0) return;

  ensureGlQuadBatchShader(state);

  const material = quadBatch.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const texture = atlas.texture;
  const glTexture = resolveGlTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (glTexture === null) return;
  const straightAlpha = runtime.context.currentTextureRealization!.straightAlpha;
  const nodeMaterialData = quadBatch.materialData;
  // Per-quad color adjustments, overriding the node-level tint for the quads that carry one.
  const perQuadColorScaleBias = data.materialData;
  const nodeColorScaleBias = quadBatch.colorScaleBias;
  const nodeColorMatrix = quadBatch.colorMatrix;
  const startInstance = prepareGlQuadBatchWrite(
    state,
    glTexture,
    straightAlpha,
    texture.sampler,
    quadBatch.blendMode,
    material,
    materialRenderer,
    instanceCount,
  );
  const base = startInstance * QUAD_BATCH_INSTANCE_FLOATS;

  const regions = atlas.regions;
  const numRegions = regions.length;
  const iw = 1 / Math.max(1, getTextureWidth(texture));
  const ih = 1 / Math.max(1, getTextureHeight(texture));
  const instanceData = runtime.quadBatchWriterInstanceData;
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
      quadTransform.a = pa;
      quadTransform.b = pb;
      quadTransform.c = pc;
      quadTransform.d = pd;
      quadTransform.tx = pa * dx + pc * dy + ptx;
      quadTransform.ty = pb * dx + pd * dy + pty;
    } else {
      const offset = i * 6;
      const la = transforms[offset],
        lb = transforms[offset + 1];
      const lc = transforms[offset + 2],
        ld = transforms[offset + 3];
      const ltx = transforms[offset + 4],
        lty = transforms[offset + 5];
      quadTransform.a = pa * la + pc * lb;
      quadTransform.b = pb * la + pd * lb;
      quadTransform.c = pa * lc + pc * ld;
      quadTransform.d = pb * lc + pd * ld;
      quadTransform.tx = pa * ltx + pc * lty + ptx;
      quadTransform.ty = pb * ltx + pd * lty + pty;
    }
    writeAtlasRegionInstance(instanceData, writeBase, quadTransform, region, iw, ih, alpha);
    packGlQuadBatchMaterialInstance(state, nodeMaterialData, startInstance + drawCount);
    // Per-quad tint overrides the node-level tint (null → the node's, itself possibly null → untinted).
    const colorScaleBias =
      (perQuadColorScaleBias?.[i] as ColorScaleBias | TintMaterialData | readonly number[] | null) ??
      nodeColorMatrix ??
      nodeColorScaleBias;
    recordGlQuadBatchColorScaleBias(state, colorScaleBias, startInstance + drawCount);
    writeBase += QUAD_BATCH_INSTANCE_FLOATS;
    drawCount++;
  }

  runtime.quadBatchWriterCount += drawCount;
}

export const defaultGlQuadBatchRenderer: SpriteRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: submitGlQuadBatch,
};

function writeAtlasRegionInstance(
  data: Float32Array,
  base: number,
  transform: typeof quadTransform,
  region: Readonly<{
    height: number;
    rotation: TextureAtlasRotation;
    width: number;
    x: number;
    y: number;
  }>,
  iw: number,
  ih: number,
  alpha: number,
): void {
  const u0 = region.x * iw;
  const v0 = region.y * ih;
  const u1 = (region.x + region.width) * iw;
  const v1 = (region.y + region.height) * ih;
  const rotated = region.rotation !== TextureAtlasRotation.None;
  const counterclockwise = region.rotation === TextureAtlasRotation.Counterclockwise90;
  writeGlQuadBatchAffineInstance(
    data,
    base,
    transform,
    rotated ? region.height : region.width,
    rotated ? region.width : region.height,
    rotated ? (counterclockwise ? u0 : u1) : u0,
    rotated && counterclockwise ? v1 : v0,
    rotated ? 0 : u1 - u0,
    rotated ? (counterclockwise ? v0 - v1 : v1 - v0) : 0,
    rotated ? (counterclockwise ? u1 - u0 : u0 - u1) : 0,
    rotated ? 0 : v1 - v0,
    alpha,
  );
}

const quadTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
