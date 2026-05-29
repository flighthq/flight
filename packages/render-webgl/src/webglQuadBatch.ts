import { concatMatrix, setMatrixFromFloat32Array } from '@flighthq/geometry';
import { acquireMatrix, releaseMatrix } from '@flighthq/geometry/matrixPool';
import { createNullRendererData } from '@flighthq/render-core';
import type { QuadBatch, RenderState, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import {
  bindWebGLTexture,
  drawWebGLQuad,
  setQuadMatrixFromOffset,
  setWebGLBlendMode,
  useWebGLProgram,
} from './webglDraw';
import { setWebGLMatrixFromTransform } from './webglShader';

export function drawWebGLQuadBatch(state: RenderState, quadBatch: SpriteRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.image === null || atlas.image.src === null || instanceCount === 0) return;

  useWebGLProgram(internal);
  setWebGLBlendMode(internal, quadBatch.blendMode);
  bindWebGLTexture(internal, atlas.image.src);

  const gl = internal.gl;
  const { shaderLoc, matrixArray } = internal;
  const regions = atlas.regions;
  const numRegions = regions.length;
  const transform = quadBatch.transform2D;
  const stride = data.transformType === 'vector2' ? 2 : 6;

  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);

  gl.uniform1f(shaderLoc.locAlpha, quadBatch.alpha);
  gl.uniform1i(shaderLoc.locTexture, 0);

  if (stride === 6) {
    const quadTransform = acquireMatrix();
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;

      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const offset = i * 6;
      setMatrixFromFloat32Array(quadTransform, offset, transforms);
      concatMatrix(quadTransform, quadTransform, transform);

      setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, quadTransform, internal.canvas);

      const u0 = region.x * iw;
      const v0 = region.y * ih;
      const u1 = (region.x + region.width) * iw;
      const v1 = (region.y + region.height) * ih;

      drawWebGLQuad(internal, 0, 0, region.width, region.height, u0, v0, u1, v1);
    }
    releaseMatrix(quadTransform);
  } else {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;

      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const offset = i * 2;
      const dx = transforms[offset];
      const dy = transforms[offset + 1];

      setQuadMatrixFromOffset(
        internal,
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.tx,
        transform.ty,
        dx,
        dy,
      );

      const u0 = region.x * iw;
      const v0 = region.y * ih;
      const u1 = (region.x + region.width) * iw;
      const v1 = (region.y + region.height) * ih;

      drawWebGLQuad(internal, 0, 0, region.width, region.height, u0, v0, u1, v1);
    }
  }
}

export const defaultWebGLQuadBatchRenderer: SpriteRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLQuadBatch,
};
