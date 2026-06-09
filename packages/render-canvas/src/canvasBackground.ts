import type { CanvasRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export function renderCanvasBackground(state: CanvasRenderState): void {
  // Reset to normal compositing directly. This deliberately bypasses the blend-mode
  // map so the background path never pulls blend-mode support into the bundle; each
  // display object re-applies its own mode through state.applyBlendMode when drawn.
  state.context.globalCompositeOperation = 'source-over';
  state.currentBlendMode = BlendMode.Normal;

  state.context.setTransform(1, 0, 0, 1, 0, 0);
  state.context.globalAlpha = 1;

  if ((state.backgroundColor & 0xff) !== 0) {
    state.context.fillStyle = state.backgroundColorString;
    state.context.fillRect(0, 0, state.canvas.width, state.canvas.height);
  } else {
    state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
  }
}
