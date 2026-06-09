import { getAppearanceRevision } from '@flighthq/scene';
import type { HasAppearance, RenderNode, RenderState, SceneNode } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export function updateRenderNodeAppearance(state: RenderState, data: RenderNode, parentData?: RenderNode): boolean {
  const appearanceID = getAppearanceRevision(data.source as SceneNode);
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

function recalculateAppearance(state: RenderState, data: RenderNode, parentData?: RenderNode) {
  const source = data.source as HasAppearance;
  if (parentData !== undefined) {
    data.visible = source.visible && parentData.visible;
    if (!data.visible) return;
    data.alpha = source.alpha * parentData.alpha;
    if (data.alpha <= 0) return;
    state.appearanceHooks?.update(state, data, parentData);
    data.blendMode = parentData.blendMode !== BlendMode.Normal ? parentData.blendMode : source.blendMode;
  } else {
    data.visible = source.visible;
    if (!data.visible) return;
    data.alpha = source.alpha * state.renderAlpha;
    if (data.alpha <= 0) return;
    state.appearanceHooks?.update(state, data, undefined);
    data.blendMode = state.renderBlendMode !== null ? state.renderBlendMode : source.blendMode;
  }
  data.appearanceFrameID = state.currentFrameID;
}
