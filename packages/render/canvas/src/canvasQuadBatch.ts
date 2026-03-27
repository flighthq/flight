import { matrix3x2, matrix3x2Pool } from '@flighthq/geometry';
import { createNullRendererData } from '@flighthq/render-core';
import type { CanvasRenderState, QuadBatch, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import { setBlendMode } from './canvasMaterials';

export function drawQuadBatch(state: CanvasRenderState, quadBatch: SpriteRenderNode): void {
  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.image === null || atlas.image.src === null || instanceCount === 0) return;

  setBlendMode(state, quadBatch.blendMode);

  const context = state.context;
  const image = atlas.image.src;
  const regions = atlas.regions;
  const numRegions = regions.length;
  const transform = quadBatch.transform2D;
  const roundPixels = state.roundPixels;

  const quadTransform = matrix3x2Pool.get();
  const stride = data.transformType === 'vector2' ? 2 : 6;

  context.globalAlpha = quadBatch.alpha;

  if (!state.allowSmoothing /*|| !quadBatch.smoothing*/) {
    context.imageSmoothingEnabled = false;
  }

  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);

  for (let i = 0; i < instanceCount; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;

    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) {
      continue;
    }

    const offset = i * stride;
    if (stride === 2) {
      const dx = transforms[offset];
      const dy = transforms[offset + 1];
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
    } else {
      matrix3x2.fromFloat32Array(quadTransform, offset, transforms);
      matrix3x2.concat(quadTransform, quadTransform, transform);

      if (roundPixels) {
        quadTransform.tx = Math.round(quadTransform.tx);
        quadTransform.ty = Math.round(quadTransform.ty);
      }

      context.setTransform(
        quadTransform.a,
        quadTransform.b,
        quadTransform.c,
        quadTransform.d,
        quadTransform.tx,
        quadTransform.ty,
      );

      context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  matrix3x2Pool.release(quadTransform);

  if (!state.allowSmoothing /*|| !quadBatch.smoothing*/) {
    context.imageSmoothingEnabled = true;
  }

  // popClipRect(state);
  // rectanglePool.release(rect);
}

export const defaultCanvasQuadBatchRenderer: SpriteRenderer = {
  createData: createNullRendererData,
  draw: drawQuadBatch,
};
