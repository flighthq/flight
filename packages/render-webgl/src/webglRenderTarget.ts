import { acquireMatrix, copyMatrix, createMatrix, multiplyMatrix, releaseMatrix } from '@flighthq/geometry';
import type { Matrix, RenderProxy2D, WebGLRenderState, WebGLRenderTarget } from '@flighthq/types';

import { drawWebGLQuad, useWebGLProgram } from './webglDraw';
import { getWebGLRenderStateRuntime } from './webglRenderState';
import { setWebGLAttributes, setWebGLBaseUniforms, setWebGLMatrixFromTransform } from './webglShader';

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
  const runtime = getWebGLRenderStateRuntime(state);
  const gl = state.gl;

  let stack = _targetStack.get(state);
  if (stack === undefined) {
    stack = [];
    _targetStack.set(state, stack);
  }

  stack.push({
    framebuffer: runtime.currentFramebuffer,
    renderTargetViewport: runtime.renderTargetViewport,
    renderTransform2D: state.renderTransform2D,
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);

  runtime.currentFramebuffer = target.framebuffer;
  runtime.renderTargetViewport = { width: target.width, height: target.height };
  // Force rebind on next draw — the framebuffer switch invalidates GL state assumptions.
  runtime.currentTexture = null;
  runtime.currentBlendMode = null;

  const newTransform = createMatrix();
  copyMatrix(newTransform, renderTransform);
  state.renderTransform2D = newTransform;
}

/**
 * Allocates a framebuffer-backed texture of the given pixel dimensions.
 * The framebuffer is bound during creation but the default framebuffer is
 * restored before returning.
 */
export function createWebGLRenderTarget(state: WebGLRenderState, width: number, height: number): WebGLRenderTarget {
  const runtime = getWebGLRenderStateRuntime(state);
  const gl = state.gl;

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

  gl.bindFramebuffer(gl.FRAMEBUFFER, runtime.currentFramebuffer);
  gl.bindTexture(gl.TEXTURE_2D, null);
  runtime.currentTexture = null;

  return { framebuffer, texture, width: w, height: h };
}

/**
 * Deletes the GL resources owned by `target`. The target object must not be
 * used after this call.
 */
export function destroyWebGLRenderTarget(state: WebGLRenderState, target: WebGLRenderTarget): void {
  const gl = state.gl;
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/**
 * Composites `target`'s texture onto the current framebuffer as a positioned quad, using
 * `renderProxy`'s world transform and alpha. `transform` maps the target's pixel space into
 * the node's local space (as produced by `computeRenderCacheTransform`). This mirrors
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
  renderProxy: RenderProxy2D,
  target: Readonly<WebGLRenderTarget>,
  transform: Readonly<Matrix>,
): void {
  if (target.width <= 0 || target.height <= 0) return;

  const runtime = getWebGLRenderStateRuntime(state);
  useWebGLProgram(state);
  state.applyBlendMode?.(state, renderProxy.blendMode);

  const gl = state.gl;
  const { shaderLoc, matrixArray } = runtime;
  // The render target already owns a GPU texture — bind it directly rather than going through
  // bindWebGLTexture, which uploads a CanvasImageSource.
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  runtime.currentTexture = target.texture;

  const quadTransform = acquireMatrix();
  multiplyMatrix(quadTransform, renderProxy.transform2D, transform);
  setWebGLAttributes(gl, shaderLoc);
  setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, quadTransform, runtime.renderTargetViewport ?? state.canvas);
  setWebGLBaseUniforms(gl, shaderLoc, renderProxy);
  releaseMatrix(quadTransform);

  drawWebGLQuad(state, 0, 0, target.width, target.height, 0, 1, 1, 0);
}

/**
 * Restores the framebuffer, viewport, renderTargetViewport, and renderTransform2D
 * saved by the matching `beginWebGLRenderTarget` call.
 */
export function endWebGLRenderTarget(state: WebGLRenderState): void {
  const runtime = getWebGLRenderStateRuntime(state);
  const gl = state.gl;

  const saved = _targetStack.get(state)?.pop();
  if (saved === undefined) return;

  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
  const viewport = saved.renderTargetViewport ?? state.canvas;
  gl.viewport(0, 0, viewport.width, viewport.height);

  runtime.currentFramebuffer = saved.framebuffer;
  runtime.renderTargetViewport = saved.renderTargetViewport;
  state.renderTransform2D = saved.renderTransform2D;
  runtime.currentTexture = null;
  runtime.currentBlendMode = null;
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
  const runtime = getWebGLRenderStateRuntime(state);
  const gl = state.gl;

  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  target.width = w;
  target.height = h;

  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  runtime.currentTexture = null;
}
