import { acquireMatrix, copyMatrix, createMatrix, multiplyMatrix, releaseMatrix } from '@flighthq/geometry';
import type { DisplayObjectRenderNode, Matrix, WebGLRenderState, WebGLRenderTarget } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { drawWebGLQuad, useWebGLProgram } from './webglDraw';
import { setWebGLAttribs, setWebGLBaseUniforms, setWebGLMatrixFromTransform } from './webglShader';

type SavedWebGLState = {
  framebuffer: WebGLFramebuffer | null;
  renderTargetViewport: { width: number; height: number } | null;
  renderTransform2D: Matrix | null;
};

const _targetStack = new WeakMap<WebGLRenderState, SavedWebGLState[]>();

/**
 * Redirects subsequent WebGL rendering into `target`'s framebuffer. Saves
 * the current framebuffer binding, renderTargetViewport, and renderTransform2D
 * so they can be fully restored by `endWebGLRenderTarget`. Supports nesting.
 *
 * The caller must set the desired `renderTransform` (via this function) before
 * rendering into the target to ensure the render tree's transform2D values are correct.
 */
export function beginWebGLRenderTarget(
  state: WebGLRenderState,
  target: WebGLRenderTarget,
  renderTransform: Readonly<Matrix>,
): void {
  const internal = state as WebGLRenderStateInternal;
  const gl = internal.gl;

  let stack = _targetStack.get(state);
  if (stack === undefined) {
    stack = [];
    _targetStack.set(state, stack);
  }

  stack.push({
    framebuffer: internal.currentFramebuffer,
    renderTargetViewport: internal.renderTargetViewport,
    renderTransform2D: internal.renderTransform2D,
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);

  internal.currentFramebuffer = target.framebuffer;
  internal.renderTargetViewport = { width: target.width, height: target.height };
  // Force rebind on next draw — the framebuffer switch invalidates GL state assumptions.
  internal.currentTexture = null;
  internal.currentBlendMode = null;

  const newTransform = createMatrix();
  copyMatrix(newTransform, renderTransform);
  internal.renderTransform2D = newTransform;
}

/**
 * Allocates a framebuffer-backed texture of the given pixel dimensions.
 * The framebuffer is bound during creation but the default framebuffer is
 * restored before returning.
 */
export function createWebGLRenderTarget(state: WebGLRenderState, width: number, height: number): WebGLRenderTarget {
  const internal = state as WebGLRenderStateInternal;
  const gl = internal.gl;

  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, state.allowSmoothing ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, state.allowSmoothing ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, internal.currentFramebuffer);
  gl.bindTexture(gl.TEXTURE_2D, null);
  internal.currentTexture = null;

  return { framebuffer, texture, width: w, height: h };
}

/**
 * Deletes the GL resources owned by `target`. The target object must not be
 * used after this call.
 */
export function destroyWebGLRenderTarget(state: WebGLRenderState, target: WebGLRenderTarget): void {
  const internal = state as WebGLRenderStateInternal;
  const gl = internal.gl;
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/**
 * Composites `target`'s texture onto the current framebuffer as a positioned quad, using
 * `renderNode`'s world transform and alpha. `transform` maps the target's pixel space into
 * the node's local space (as produced by `computeImageRenderCacheTransform`). This mirrors
 * `drawWebGLImageCacheResult` but sources a GPU render-target texture directly instead of an
 * uploaded `CanvasImageSource`, closing the offscreen-filter loop: render a node into a
 * target, run a filter pass (target → target), then composite the result back here.
 *
 * Render-target textures are stored with GL's bottom-left origin, so the rendered content's
 * visual top sits at texture `v=1` — the opposite of uploaded canvas images. The quad's V
 * coordinates are flipped (`v0=1, v1=0`) so the result composites upright.
 */
export function drawWebGLRenderTargetResult(
  state: WebGLRenderState,
  renderNode: DisplayObjectRenderNode,
  target: Readonly<WebGLRenderTarget>,
  transform: Readonly<Matrix>,
): void {
  if (target.width <= 0 || target.height <= 0) return;

  const internal = state as WebGLRenderStateInternal;
  useWebGLProgram(internal);
  internal.applyBlendMode?.(internal, renderNode.blendMode);

  const { gl, shaderLoc, matrixArray } = internal;
  // The render target already owns a GPU texture — bind it directly rather than going through
  // bindWebGLTexture, which uploads a CanvasImageSource.
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  internal.currentTexture = target.texture;

  const quadTransform = acquireMatrix();
  multiplyMatrix(quadTransform, renderNode.transform2D, transform);
  setWebGLAttribs(gl, shaderLoc);
  setWebGLMatrixFromTransform(
    gl,
    shaderLoc,
    matrixArray,
    quadTransform,
    internal.renderTargetViewport ?? internal.canvas,
  );
  setWebGLBaseUniforms(gl, shaderLoc, renderNode);
  releaseMatrix(quadTransform);

  drawWebGLQuad(internal, 0, 0, target.width, target.height, 0, 1, 1, 0);
}

/**
 * Restores the framebuffer, viewport, renderTargetViewport, and renderTransform2D
 * saved by the matching `beginWebGLRenderTarget` call.
 */
export function endWebGLRenderTarget(state: WebGLRenderState): void {
  const internal = state as WebGLRenderStateInternal;
  const gl = internal.gl;

  const saved = _targetStack.get(state)?.pop();
  if (saved === undefined) return;

  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
  const viewport = saved.renderTargetViewport ?? internal.canvas;
  gl.viewport(0, 0, viewport.width, viewport.height);

  internal.currentFramebuffer = saved.framebuffer;
  internal.renderTargetViewport = saved.renderTargetViewport;
  internal.renderTransform2D = saved.renderTransform2D;
  internal.currentTexture = null;
  internal.currentBlendMode = null;
}

/**
 * Reallocates the texture backing `target` to the new pixel dimensions.
 * Preserves the existing framebuffer object — only the texture storage changes.
 */
export function resizeWebGLRenderTarget(
  state: WebGLRenderState,
  target: WebGLRenderTarget,
  width: number,
  height: number,
): void {
  const internal = state as WebGLRenderStateInternal;
  const gl = internal.gl;

  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  target.width = w;
  target.height = h;

  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  internal.currentTexture = null;
}
