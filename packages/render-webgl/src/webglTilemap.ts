import { createNullRendererData } from '@flighthq/render';
import type { RenderState, SpriteRenderer, SpriteRenderTreeNode, Tilemap } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture, drawWebGLQuad, setWebGLBlendMode, useWebGLProgram } from './webglDraw';
import { setWebGLBaseUniforms, setWebGLMatrixFromValues } from './webglShader';

export function drawWebGLTilemap(state: RenderState, tilemapNode: SpriteRenderTreeNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = tilemapNode.source as Tilemap;
  const { tileset, columns, rows, tiles } = source.data;

  if (tileset === null) return;
  const atlas = tileset.atlas;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;
  if (columns === 0 || rows === 0) return;

  useWebGLProgram(internal);
  setWebGLBlendMode(internal, tilemapNode.blendMode);
  bindWebGLTexture(internal, atlas.image.src);

  const gl = internal.gl;
  const { shaderLoc, matrixArray } = internal;
  const regions = atlas.regions;
  const numRegions = regions.length;
  const transform = tilemapNode.transform2D;
  const { tileWidth, tileHeight } = tileset;

  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);

  setWebGLBaseUniforms(gl, shaderLoc, tilemapNode);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const id = tiles[row * columns + col];
      if (id < 0 || id >= numRegions) continue;

      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;

      const dx = col * tileWidth;
      const dy = row * tileHeight;

      // Effective transform: tile's offset baked into the translation
      setWebGLMatrixFromValues(
        gl,
        shaderLoc,
        matrixArray,
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.tx + transform.a * dx + transform.c * dy,
        transform.ty + transform.b * dx + transform.d * dy,
        internal.canvas,
      );

      const u0 = region.x * iw;
      const v0 = region.y * ih;
      const u1 = (region.x + region.width) * iw;
      const v1 = (region.y + region.height) * ih;

      drawWebGLQuad(internal, 0, 0, tileWidth, tileHeight, u0, v0, u1, v1);
    }
  }
}

export const defaultWebGLTilemapRenderer: SpriteRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLTilemap,
};
