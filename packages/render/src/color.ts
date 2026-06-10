import type { RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';

// Takes a 24-bit RGB color (`0xRRGGBB`, e.g. a TextFormat color) and returns a
// CSS `#RRGGBB` string. Any high-byte bits are masked off, so a 32-bit RGBA
// value would keep `GGBBAA` — pass RGB, not RGBA.
export function rgbToHexString(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function setRenderStateBackgroundColor(state: RenderState, color: number): void {
  const _state = state as RenderStateInternal;
  const uint = color >>> 0;
  _state.backgroundColor = uint;
  const r = (uint & 0xff000000) >>> 24;
  const g = (uint & 0x00ff0000) >>> 16;
  const b = (uint & 0x0000ff00) >>> 8;
  const a = uint & 0xff;
  _state.backgroundColorRGBA[0] = r / 0xff;
  _state.backgroundColorRGBA[1] = g / 0xff;
  _state.backgroundColorRGBA[2] = b / 0xff;
  _state.backgroundColorRGBA[3] = a / 0xff;
  _state.backgroundColorString = '#' + uint.toString(16).padStart(8, '0').toUpperCase();
}
