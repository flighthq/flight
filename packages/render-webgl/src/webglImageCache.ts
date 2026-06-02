import { multiplyMatrix } from '@flighthq/geometry';
import { acquireMatrix, releaseMatrix } from '@flighthq/geometry/matrixPool';
import type { DisplayObjectRenderTreeNode, ImageCacheResult, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture, drawWebGLQuad, setWebGLBlendMode, useWebGLProgram } from './webglDraw';
import { setWebGLAttribs, setWebGLBaseUniforms, setWebGLMatrixFromTransform } from './webglShader';

export function drawWebGLImageCacheResult(
  state: WebGLRenderState,
  renderNode: DisplayObjectRenderTreeNode,
  cache: ImageCacheResult,
): void {
  const cacheSource = cache.source;
  if (cacheSource === null) return;
  const src = cacheSource.src;
  if (src === null) return;
  if (cacheSource.width <= 0 || cacheSource.height <= 0) return;

  const internal = state as WebGLRenderStateInternal;
  useWebGLProgram(internal);
  setWebGLBlendMode(internal, renderNode.blendMode);
  bindWebGLTexture(internal, src);

  const quadTransform = acquireMatrix();
  multiplyMatrix(quadTransform, renderNode.transform2D, cache.transform);

  const { gl, shaderLoc, matrixArray } = internal;
  setWebGLAttribs(gl, shaderLoc);
  setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, quadTransform, internal.canvas);
  setWebGLBaseUniforms(gl, shaderLoc, renderNode);
  releaseMatrix(quadTransform);

  drawWebGLQuad(internal, 0, 0, cacheSource.width, cacheSource.height, 0, 0, 1, 1);
}
