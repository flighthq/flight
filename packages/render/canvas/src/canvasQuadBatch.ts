import { matrix3x2, matrix3x2Pool, rectangle, rectanglePool } from '@flighthq/geometry';
import { createNullRendererData } from '@flighthq/render-core';
import type { CanvasRenderState, QuadBatch, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import { popClipRect, pushClipRect } from './canvasClipRect';
import { setBlendMode } from './canvasMaterials';

export function drawQuadBatch(state: CanvasRenderState, quadBatch: SpriteRenderNode): void {
  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.image === null || atlas.image.src === null || instanceCount === 0) return;

  const context = state.context;

  setBlendMode(state, quadBatch.blendMode);

  const regions = atlas.regions;
  const numRegions = regions.length;

  const quadTransform = matrix3x2Pool.get();

  var transform = quadBatch.transform2D;
  // var roundPixels = renderer.__roundPixels;
  // var alpha = quadBatch.alpha;
  const stride = data.transformType === 'vector2' ? 2 : 6;

  context.save(); // TODO: Restore transform without save/restore

  for (let i = 0; i < length; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;

    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) {
      continue;
    }

    const offset = i * stride;

    if (stride === 2) {
      matrix3x2.setTo(quadTransform, 1, 0, 0, 1, transforms[offset], transforms[offset + 1]);
    } else {
      matrix3x2.fromFloat32Array(quadTransform, offset, transforms);
    }
    matrix3x2.concat(quadTransform, quadTransform, transform);

    // if (roundPixels) {

    // 	quadTransform.tx = Math.round (quadTransform.tx);
    // 	quadTransform.ty = Math.round (quadTransform.ty);

    // }

    context.setTransform(
      quadTransform.a,
      quadTransform.b,
      quadTransform.c,
      quadTransform.d,
      quadTransform.tx,
      quadTransform.ty,
    );

    context.drawImage(
      atlas.image.src,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height,
    );
  }

  matrix3x2Pool.release(quadTransform);
  context.restore();

  // if (!state.allowSmoothing || !quadBatch.smoothing)
  // {
  //   context.imageSmoothingEnabled = true;
  // }

  // popClipRect(state);

  // rectanglePool.release(rect);
}

export const defaultCanvasQuadBatchRenderer: SpriteRenderer = {
  createData: createNullRendererData,
  draw: drawQuadBatch,
};
