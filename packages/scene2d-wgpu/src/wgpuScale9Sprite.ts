import { createMatrix3 } from '@flighthq/geometry/contract';
import {
  getWgpuRenderStateRuntime,
  resolveWgpuMaterialRenderer,
  resolveWgpuTexture,
} from '@flighthq/render-wgpu/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureUvMatrix, getTextureViewSize, hasTextureSource } from '@flighthq/texture/contract';
import type { RenderProxy2D, Scale9Sprite, Scene2DRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  QUAD_BATCH_INSTANCE_FLOATS,
  recordWgpuQuadBatchColorScaleBias,
  writeWgpuQuadBatchAffineInstance,
} from './wgpuQuadBatchWriter';
import { buildWgpuScale9Mapper } from './wgpuScale9Mapper';

const SLICE_COUNT = 9;

export function drawWgpuScale9Sprite(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as Scale9Sprite;
  const { scale9Grid, texture } = source.data;
  if (texture === null || texture.dimension !== '2d' || !hasTextureSource(texture)) return;

  getTextureViewSize(scale9ViewSize, texture);
  const width = scale9ViewSize.x;
  const height = scale9ViewSize.y;
  const scaleX = source.scaleX;
  const scaleY = source.scaleY;
  const mapper = buildWgpuScale9Mapper({ height, width, x: 0, y: 0 }, scale9Grid, scaleX, scaleY);
  if (mapper === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const textureEntry = resolveWgpuTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (textureEntry === null) return;

  getTextureUvMatrix(scale9UvMatrix, texture);
  const uv = scale9UvMatrix.m;

  const sourceXs = [0, scale9Grid.x, scale9Grid.x + scale9Grid.width, width];
  const sourceYs = [0, scale9Grid.y, scale9Grid.y + scale9Grid.height, height];
  const targetXs = sourceXs.map(mapper.mapX);
  const targetYs = sourceYs.map(mapper.mapY);

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
      const localU = sourceXs[column] / width;
      const localV = sourceYs[row] / height;
      const deltaU = (sourceXs[column + 1] - sourceXs[column]) / width;
      const deltaV = (sourceYs[row + 1] - sourceYs[row]) / height;
      sliceTransform.a = a;
      sliceTransform.b = b;
      sliceTransform.c = c;
      sliceTransform.d = d;
      sliceTransform.tx = a * x + c * y + transform.tx;
      sliceTransform.ty = b * x + d * y + transform.ty;
      writeWgpuQuadBatchAffineInstance(
        data,
        writeBase,
        sliceTransform,
        sliceWidth,
        sliceHeight,
        uv[6] + uv[0] * localU + uv[3] * localV,
        uv[7] + uv[1] * localU + uv[4] * localV,
        uv[0] * deltaU,
        uv[1] * deltaU,
        uv[3] * deltaV,
        uv[4] * deltaV,
        renderProxy.alpha,
      );
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

const scale9UvMatrix = createMatrix3();
const scale9ViewSize = { x: 0, y: 0 };
const sliceTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
