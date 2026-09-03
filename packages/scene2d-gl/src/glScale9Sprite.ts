import { getGlRenderStateRuntime, resolveGlMaterialRenderer, resolveGlTexture } from '@flighthq/render-gl/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureSourceKind, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import type { GlRenderState, RenderProxy2D, Scale9Sprite, Scene2DRenderer } from '@flighthq/types/contract';
import { BatchFormat, RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import {
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
} from './glQuadBatchWriter';
import { buildGlScale9Mapper } from './glScale9Mapper';

const INSTANCE_FLOATS = 13;
const SCALE9_QUAD_COUNT = 9;

export function drawGlScale9Sprite(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as Scale9Sprite;
  const texture = source.data.texture;
  if (texture === null || texture.dimension !== '2d' || !hasTextureSource(texture)) return;

  const width = Math.max(0, getTextureWidth(texture)) * Math.abs(texture.uvScale.x);
  const height = Math.max(0, getTextureHeight(texture)) * Math.abs(texture.uvScale.y);
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

  let u0 = texture.uvOffset.x;
  let v0 = texture.uvOffset.y;
  let u1 = u0 + texture.uvScale.x;
  let v1 = v0 + texture.uvScale.y;
  if (texture.flipX) [u0, u1] = [u1, u0];
  if (texture.flipY) [v0, v1] = [v1, v0];
  if (getTextureSourceKind(texture) === RenderTargetTextureSourceKind) {
    v0 = 1 - v0;
    v1 = 1 - v1;
  }

  const grid = source.data.scale9Grid;
  const sourceX = [0, grid.x, grid.x + grid.width, width];
  const sourceY = [0, grid.y, grid.y + grid.height, height];
  const targetX = sourceX.map(mapper.mapX);
  const targetY = sourceY.map(mapper.mapY);
  const textureU = sourceX.map((x) => u0 + ((u1 - u0) * x) / width);
  const textureV = sourceY.map((y) => v0 + ((v1 - v0) * y) / height);

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
  let instanceIndex = startCount;
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const x = targetX[column];
      const y = targetY[row];
      data[writeBase] = a;
      data[writeBase + 1] = b;
      data[writeBase + 2] = c;
      data[writeBase + 3] = d;
      data[writeBase + 4] = a * x + c * y + transform.tx;
      data[writeBase + 5] = b * x + d * y + transform.ty;
      data[writeBase + 6] = targetX[column + 1] - x;
      data[writeBase + 7] = targetY[row + 1] - y;
      data[writeBase + 8] = textureU[column];
      data[writeBase + 9] = textureV[row];
      data[writeBase + 10] = textureU[column + 1];
      data[writeBase + 11] = textureV[row + 1];
      data[writeBase + 12] = renderProxy.alpha;
      packGlQuadBatchMaterialInstance(state, renderProxy.materialData, instanceIndex);
      recordGlQuadBatchColorScaleBias(state, colorScaleBias, instanceIndex);
      writeBase += INSTANCE_FLOATS;
      instanceIndex++;
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
