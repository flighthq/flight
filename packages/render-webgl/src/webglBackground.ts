import type { WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';

export function renderWebGLBackground(state: WebGLRenderState): void {
  const internal = state as WebGLRenderStateInternal;
  const gl = internal.gl;
  const viewport = internal.renderTargetViewport ?? internal.canvas;
  gl.viewport(0, 0, viewport.width, viewport.height);
  const rgba = state.backgroundColorRGBA;
  if (rgba.length >= 4 && rgba[3] > 0) {
    gl.clearColor(rgba[0], rgba[1], rgba[2], rgba[3]);
  } else {
    gl.clearColor(0, 0, 0, 0);
  }
  gl.clear(gl.COLOR_BUFFER_BIT);
  state.currentBlendMode = null;
}
