import {
  getWgpuRenderStateRuntime,
  resolveWgpuMaterialRenderer,
  resolveWgpuTexture,
} from '@flighthq/render-wgpu/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import type { RenderProxy2D, Scale9Sprite, Scene2DRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  QUAD_BATCH_INSTANCE_FLOATS,
  recordWgpuQuadBatchColorScaleBias,
} from './wgpuQuadBatchWriter';
import { buildWgpuScale9Mapper } from './wgpuScale9Mapper';

const SLICE_COUNT = 9;

export function drawWgpuScale9Sprite(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as Scale9Sprite;
  const { scale9Grid, texture } = source.data;
  if (texture === null || texture.dimension !== '2d' || !hasTextureSource(texture)) return;

  const width = Math.max(0, getTextureWidth(texture)) * Math.abs(texture.uvScale.x);
  const height = Math.max(0, getTextureHeight(texture)) * Math.abs(texture.uvScale.y);
  const scaleX = source.scaleX;
  const scaleY = source.scaleY;
  const mapper = buildWgpuScale9Mapper({ height, width, x: 0, y: 0 }, scale9Grid, scaleX, scaleY);
  if (mapper === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const textureEntry = resolveWgpuTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (textureEntry === null) return;

  let u0 = texture.uvOffset.x;
  let v0 = texture.uvOffset.y;
  let u1 = u0 + texture.uvScale.x;
  let v1 = v0 + texture.uvScale.y;
  if (texture.flipX) [u0, u1] = [u1, u0];
  if (texture.flipY) [v0, v1] = [v1, v0];

  const sourceXs = [0, scale9Grid.x, scale9Grid.x + scale9Grid.width, width];
  const sourceYs = [0, scale9Grid.y, scale9Grid.y + scale9Grid.height, height];
  const targetXs = sourceXs.map(mapper.mapX);
  const targetYs = sourceYs.map(mapper.mapY);
  const us = sourceXs.map((value) => u0 + ((u1 - u0) * value) / width);
  const vs = sourceYs.map((value) => v0 + ((v1 - v0) * value) / height);

  const base = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
    texture.sampler,
    renderProxy.blendMode,
    material,
    materialRenderer,
    SLICE_COUNT,
  );
  // Reservation may flush an incompatible batch, so all parallel instance streams must index from
  // the writer count observed after prepareWgpuQuadBatchWrite.
  const startCount = runtime.quadBatchWriterCount;
  const data = runtime.quadBatchWriterInstanceData;
  const transform = renderProxy.transform2D;
  const a = transform.a / scaleX;
  const b = transform.b / scaleX;
  const c = transform.c / scaleY;
  const d = transform.d / scaleY;
  const colorScaleBias = renderProxy.colorMatrix ?? renderProxy.colorScaleBias;

  let writeBase = base;
  let instance = 0;
  for (let row = 0; row < 3; row++) {
    const y = targetYs[row];
    const sliceHeight = targetYs[row + 1] - y;
    for (let column = 0; column < 3; column++) {
      const x = targetXs[column];
      const sliceWidth = targetXs[column + 1] - x;
      data[writeBase] = a;
      data[writeBase + 1] = b;
      data[writeBase + 2] = c;
      data[writeBase + 3] = d;
      data[writeBase + 4] = a * x + c * y + transform.tx;
      data[writeBase + 5] = b * x + d * y + transform.ty;
      data[writeBase + 6] = sliceWidth;
      data[writeBase + 7] = sliceHeight;
      data[writeBase + 8] = us[column];
      data[writeBase + 9] = vs[row];
      data[writeBase + 10] = us[column + 1];
      data[writeBase + 11] = vs[row + 1];
      data[writeBase + 12] = renderProxy.alpha;
      packWgpuQuadBatchMaterialInstance(state, renderProxy.materialData, startCount + instance);
      recordWgpuQuadBatchColorScaleBias(state, colorScaleBias, startCount + instance);
      writeBase += QUAD_BATCH_INSTANCE_FLOATS;
      instance++;
    }
  }
  runtime.quadBatchWriterCount += SLICE_COUNT;
}

export const defaultWgpuScale9SpriteRenderer: Scene2DRenderer = {
  createData: createSpriteRendererData,
  format: BatchFormat.Quad,
  isDirty: isSpriteRendererDirty,
  submit: drawWgpuScale9Sprite,
};
