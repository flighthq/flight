import { colorTransform } from '@flighthq/materials';
import type { ColorTransform } from '@flighthq/types';
import type { RenderableData, RendererState } from '@flighthq/types/render/core';

import type { RendererStateInternal } from './internal/writeInternal';

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

export function updateColorTransform(state: RendererState, data: RenderableData, parentData?: RenderableData): void {
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
  if (parentTransform !== null && !colorTransform.isIdentity(parentTransform)) {
    if (transform !== null) {
      colorTransform.concat(out, transform, parentTransform);
    } else {
      colorTransform.copy(out, parentTransform);
    }
    return true;
  } else if (transform !== null && !colorTransform.isIdentity(transform)) {
    colorTransform.copy(out, transform);
    return true;
  }
  return false;
}
