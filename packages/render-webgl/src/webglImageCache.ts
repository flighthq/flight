import { multiplyMatrix } from '@flighthq/geometry';
import { acquireMatrix, releaseMatrix } from '@flighthq/geometry/matrixPool';
import type { DisplayObjectRenderNode, ImageCacheResult, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture, drawWebGLQuad, setWebGLBlendMode, useWebGLProgram } from './webglDraw';
import { setWebGLAttribs, setWebGLBaseUniforms, setWebGLMatrixFromTransform } from './webglShader';

export function drawWebGLImageCacheResult(
  state: WebGLRenderState,
  renderNode: DisplayObjectRenderNode,
  cache: ImageCacheResult,
): void {
  if (cache.source === null || cache.source.src === null) return;
  const source = cache.source;
  if (source.width <= 0 || source.height <= 0) return;

  const internal = state as WebGLRenderStateInternal;
  useWebGLProgram(internal);
  setWebGLBlendMode(internal, renderNode.blendMode);
  bindWebGLTexture(internal, source.src);

  const quadTransform = acquireMatrix();
  multiplyMatrix(quadTransform, renderNode.transform2D, cache.transform);

  const { gl, shaderLoc, matrixArray } = internal;
  setWebGLAttribs(gl, shaderLoc);
  setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, quadTransform, internal.canvas);
  setWebGLBaseUniforms(gl, shaderLoc, renderNode);
  releaseMatrix(quadTransform);

  drawWebGLQuad(internal, 0, 0, source.width, source.height, 0, 0, 1, 1);
}
