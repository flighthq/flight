import { createMatrix3 } from '@flighthq/geometry/contract';
import { getGlRenderStateRuntime, resolveGlMaterialRenderer, resolveGlTexture } from '@flighthq/render-gl/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import {
  getTextureSourceKind,
  getTextureUvMatrix,
  getTextureViewSize,
  hasTextureSource,
} from '@flighthq/texture/contract';
import type { GlRenderState, RenderProxy2D, Scale9Sprite, Scene2DRenderer } from '@flighthq/types/contract';
import { BatchFormat, RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import {
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
  writeGlQuadBatchAffineInstance,
} from './glQuadBatchWriter';
import { buildGlScale9Mapper } from './glScale9Mapper';

const INSTANCE_FLOATS = 13;
const SCALE9_QUAD_COUNT = 9;

export function drawGlScale9Sprite(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as Scale9Sprite;
  const texture = source.data.texture;
  if (texture === null || texture.dimension !== '2d' || !hasTextureSource(texture)) return;

  getTextureViewSize(scale9ViewSize, texture);
  const width = scale9ViewSize.x;
  const height = scale9ViewSize.y;
  if (width <= 0 || height <= 0) return;

  const mapper = buildGlScale9Mapper(
    { height, width, x: 0, y: 0 },
    source.data.scale9Grid,
    source.scaleX,
    source.scaleY,
  );
  if (mapper === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const glTexture = resolveGlTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (glTexture === null) return;
  const straightAlpha = runtime.context.currentTextureRealization!.straightAlpha;
  ensureGlQuadBatchShader(state);

  getTextureUvMatrix(scale9UvMatrix, texture);
  const uv = scale9UvMatrix.m;
  const reflectV = getTextureSourceKind(texture) === RenderTargetTextureSourceKind;

  const grid = source.data.scale9Grid;
  const sourceX = [0, grid.x, grid.x + grid.width, width];
  const sourceY = [0, grid.y, grid.y + grid.height, height];
  const targetX = sourceX.map(mapper.mapX);
  const targetY = sourceY.map(mapper.mapY);

  const base = prepareGlQuadBatchWrite(
    state,
    glTexture,
    straightAlpha,
    texture.sampler,
    renderProxy.blendMode,
    material,
    materialRenderer,
    SCALE9_QUAD_COUNT,
  );
  const startCount = runtime.quadBatchWriterCount;
  const data = runtime.quadBatchWriterInstanceData;
  const transform = renderProxy.transform2D;
  const a = transform.a / source.scaleX;
  const b = transform.b / source.scaleX;
  const c = transform.c / source.scaleY;
  const d = transform.d / source.scaleY;
  const colorScaleBias = renderProxy.colorMatrix ?? renderProxy.colorScaleBias;

  let writeBase = base;
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const instanceIndex = startCount + row * 3 + column;
      const x = targetX[column];
      const y = targetY[row];
      const localU = sourceX[column] / width;
      const localV = sourceY[row] / height;
      const deltaU = (sourceX[column + 1] - sourceX[column]) / width;
      const deltaV = (sourceY[row + 1] - sourceY[row]) / height;
      const uvOriginY = uv[7] + uv[1] * localU + uv[4] * localV;
      sliceTransform.a = a;
      sliceTransform.b = b;
      sliceTransform.c = c;
      sliceTransform.d = d;
      sliceTransform.tx = a * x + c * y + transform.tx;
      sliceTransform.ty = b * x + d * y + transform.ty;
      writeGlQuadBatchAffineInstance(
        data,
        writeBase,
        sliceTransform,
        targetX[column + 1] - x,
        targetY[row + 1] - y,
        uv[6] + uv[0] * localU + uv[3] * localV,
        reflectV ? 1 - uvOriginY : uvOriginY,
        uv[0] * deltaU,
        (reflectV ? -uv[1] : uv[1]) * deltaU,
        uv[3] * deltaV,
        (reflectV ? -uv[4] : uv[4]) * deltaV,
        renderProxy.alpha,
      );
      packGlQuadBatchMaterialInstance(state, renderProxy.materialData, instanceIndex);
      recordGlQuadBatchColorScaleBias(state, colorScaleBias, instanceIndex);
      writeBase += INSTANCE_FLOATS;
    }
  }

  runtime.quadBatchWriterCount += SCALE9_QUAD_COUNT;
}

export const defaultGlScale9SpriteRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createSpriteRendererData,
  isDirty: isSpriteRendererDirty,
  submit: drawGlScale9Sprite,
};

const scale9UvMatrix = createMatrix3();
const scale9ViewSize = { x: 0, y: 0 };
const sliceTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
