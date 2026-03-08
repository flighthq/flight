import { getAppearanceID } from '@flighthq/scene-graph-display';
import type { DisplayObjectRenderNode, RenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { updateColorTransform } from './color';

export function updateAppearance(
  state: RenderState,
  data: DisplayObjectRenderNode,
  parentData?: DisplayObjectRenderNode,
): boolean {
  const appearanceID = getAppearanceID(data.source);
  if (
    (parentData !== undefined && parentData.appearanceFrameID === state.currentFrameID) ||
    data.lastAppearanceID !== appearanceID
  ) {
    recalculateAppearance(state, data, parentData);
    data.lastAppearanceID = appearanceID;
    return true;
  }
  return false;
}

function recalculateAppearance(
  state: RenderState,
  data: DisplayObjectRenderNode,
  parentData?: DisplayObjectRenderNode,
) {
  const source = data.source;
  if (parentData !== undefined) {
    data.visible = source.visible && parentData.visible;
    if (!data.visible) return;
    data.alpha = source.alpha * parentData.alpha;
    if (data.alpha <= 0) return;
    updateColorTransform(state, data, parentData);
    data.blendMode = parentData.blendMode !== BlendMode.Normal ? parentData.blendMode : source.blendMode;
    data.shader = parentData.shader !== null ? parentData.shader : source.shader;
  } else {
    data.visible = source.visible;
    if (!data.visible) return;
    data.alpha = source.alpha * state.renderAlpha;
    if (data.alpha <= 0) return;
    updateColorTransform(state, data);
    data.blendMode = state.renderBlendMode !== null ? state.renderBlendMode : source.blendMode;
    data.shader = state.renderShader !== null ? state.renderShader : source.shader;
  }
  data.appearanceFrameID = state.currentFrameID;
}
