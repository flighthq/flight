import type { RendererState } from '@flighthq/types/render';

import type { RendererStateInternal } from './internal/write';

export function setBackgroundColor(state: RendererState, color: number): void {
  const _state = state as RendererStateInternal;
  _state.backgroundColor = color;
  const r = (color & 0xff000000) >>> 24;
  const g = (color & 0x00ff0000) >>> 16;
  const b = (color & 0x0000ff00) >>> 8;
  const a = color & 0xff;
  _state.backgroundColorRGBA[0] = r / 0xff;
  _state.backgroundColorRGBA[1] = g / 0xff;
  _state.backgroundColorRGBA[2] = b / 0xff;
  _state.backgroundColorRGBA[3] = a / 0xff;
  _state.backgroundColorString = '#' + color.toString(16).padStart(8, '0').toUpperCase();
}
