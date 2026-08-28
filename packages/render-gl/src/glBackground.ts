import { srgbChannelToLinear } from '@flighthq/color/contract';
import type { GlRenderState } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

export function renderGlBackground(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const viewport = runtime.renderTargetViewport;
  gl.viewport(
    viewport?.x ?? 0,
    viewport?.y ?? 0,
    viewport?.width ?? gl.drawingBufferWidth,
    viewport?.height ?? gl.drawingBufferHeight,
  );
  const rgba = state.backgroundColorRgba;
  if (rgba.length >= 4 && rgba[3] > 0) {
    const linear = runtime.currentRenderTarget?.colorSpace === 'linear';
    gl.clearColor(
      linear ? srgbChannelToLinear(rgba[0]) : rgba[0],
      linear ? srgbChannelToLinear(rgba[1]) : rgba[1],
      linear ? srgbChannelToLinear(rgba[2]) : rgba[2],
      rgba[3],
    );
  } else {
    gl.clearColor(0, 0, 0, 0);
  }
  gl.clear(gl.COLOR_BUFFER_BIT);
  runtime.currentBlendMode = null;
}
