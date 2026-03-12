import type { CanvasRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { setBlendMode } from './canvasMaterials';

export function renderBackground(state: CanvasRenderState): void {
  const cacheBlendMode = state.currentBlendMode;
  state.currentBlendMode = null;
  setBlendMode(state, BlendMode.Normal);

  state.context.setTransform(1, 0, 0, 1, 0, 0);
  state.context.globalAlpha = 1;

  if ((state.backgroundColor & 0xff) !== 0) {
    state.context.fillStyle = state.backgroundColorString;
    state.context.fillRect(0, 0, state.canvas.width, state.canvas.height);
  } else {
    state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
  }

  setBlendMode(state, cacheBlendMode);
}
