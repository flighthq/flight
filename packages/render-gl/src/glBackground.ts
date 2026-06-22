import type { GlRenderState } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';

export function renderGlBackground(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const viewport = runtime.renderTargetViewport ?? state.canvas;
  gl.viewport(0, 0, viewport.width, viewport.height);
  const rgba = state.backgroundColorRgba;
  if (rgba.length >= 4 && rgba[3] > 0) {
    gl.clearColor(rgba[0], rgba[1], rgba[2], rgba[3]);
  } else {
    gl.clearColor(0, 0, 0, 0);
  }
  gl.clear(gl.COLOR_BUFFER_BIT);
  runtime.currentBlendMode = null;
}
