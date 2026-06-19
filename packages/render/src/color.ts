import type { RenderState } from '@flighthq/types';

export function setRenderStateBackgroundColor(state: RenderState, color: number): void {
  // backgroundColor/RGBA/String are readonly on the entity but owned and written here; narrow
  // writable cast at this one call site avoids reintroducing a broad internal-cast type.
  const _state = state as { backgroundColor: number; backgroundColorRGBA: number[]; backgroundColorString: string };
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
