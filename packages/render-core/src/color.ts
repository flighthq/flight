import { concatColorTransform, copyColorTransform, isIdentityColorTransform } from '@flighthq/materials';

export function rgbaToHexString(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
import type { ColorTransform, RenderNode, RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';

export function setRenderStateBackgroundColor(state: RenderState, color: number): void {
  const _state = state as RenderStateInternal;
  const uint = color >>> 0; // ensure 0..0xFFFFFFFF
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

export function updateRenderNodeColorTransform(state: RenderState, data: RenderNode, parentData?: RenderNode): void {
  const source = data.source;
  const transform = source.colorTransform ?? null;
  let parentTransform = null;
  if (parentData !== undefined) {
    if (parentData.useColorTransform) {
      parentTransform = parentData.colorTransform;
    }
  } else {
    if (state.renderColorTransform !== null) {
      parentTransform = state.renderColorTransform;
    }
  }
  data.useColorTransform = recalculateColorTransform(data.colorTransform, transform, parentTransform);
}

function recalculateColorTransform(
  out: ColorTransform,
  transform: Readonly<ColorTransform> | null,
  parentTransform: Readonly<ColorTransform> | null,
): boolean {
  if (parentTransform !== null && !isIdentityColorTransform(parentTransform)) {
    if (transform !== null) {
      concatColorTransform(out, transform, parentTransform);
    } else {
      copyColorTransform(out, parentTransform);
    }
    return true;
  } else if (transform !== null && !isIdentityColorTransform(transform)) {
    copyColorTransform(out, transform);
    return true;
  }
  return false;
}
