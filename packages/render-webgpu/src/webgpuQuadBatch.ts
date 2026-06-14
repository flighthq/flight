import { acquireMatrix, multiplyMatrix, releaseMatrix, setMatrixFromFloat32Array } from '@flighthq/geometry';
import { noopRendererData } from '@flighthq/render';
import type { QuadBatch, RenderState, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture, drawWebGPUQuadWithTransform } from './webgpuDraw';

export function drawWebGPUQuadBatch(state: RenderState, quadBatch: SpriteRenderNode): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.image === null || atlas.image.src === null || instanceCount === 0) return;

  internal.applyBlendMode?.(internal, quadBatch.blendMode);
  const textureEntry = bindWebGPUTexture(internal, atlas.image.src);

  const regions = atlas.regions;
  const numRegions = regions.length;
  const transform = quadBatch.transform2D;
  const stride = data.transformType === 'vector2' ? 2 : 6;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);

  if (stride === 6) {
    const quadTransform = acquireMatrix();
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      setMatrixFromFloat32Array(quadTransform, i * 6, transforms);
      multiplyMatrix(quadTransform, transform, quadTransform);

      const u0 = region.x * iw;
      const v0 = region.y * ih;
      const u1 = (region.x + region.width) * iw;
      const v1 = (region.y + region.height) * ih;

      drawWebGPUQuadWithTransform(
        internal,
        quadBatch,
        quadTransform,
        textureEntry,
        0,
        0,
        region.width,
        region.height,
        u0,
        v0,
        u1,
        v1,
      );
    }
    releaseMatrix(quadTransform);
  } else {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const dx = transforms[i * 2];
      const dy = transforms[i * 2 + 1];

      // Fold the per-instance offset into the world transform
      const offsetTransform = {
        a: transform.a,
        b: transform.b,
        c: transform.c,
        d: transform.d,
        tx: transform.tx + transform.a * dx + transform.c * dy,
        ty: transform.ty + transform.b * dx + transform.d * dy,
      };

      const u0 = region.x * iw;
      const v0 = region.y * ih;
      const u1 = (region.x + region.width) * iw;
      const v1 = (region.y + region.height) * ih;

      drawWebGPUQuadWithTransform(
        internal,
        quadBatch,
        offsetTransform,
        textureEntry,
        0,
        0,
        region.width,
        region.height,
        u0,
        v0,
        u1,
        v1,
      );
    }
  }
}

export const defaultWebGPUQuadBatchRenderer: SpriteRenderer = {
  createData: noopRendererData,
  draw: drawWebGPUQuadBatch,
};
