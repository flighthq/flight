import { getNodeAppearanceRevision } from '@flighthq/node';
import type { HasAppearance, Node, RenderProxy, RenderState } from '@flighthq/types';

import { getRenderStateRuntime } from './renderState';

export function updateRenderProxyAppearance(state: RenderState, data: RenderProxy, parentData?: RenderProxy): boolean {
  const appearanceID = getNodeAppearanceRevision(data.source as Node);
  if (
    (parentData !== undefined && parentData.appearanceFrameID === getRenderStateRuntime(state).currentFrameID) ||
    data.lastAppearanceID !== appearanceID
  ) {
    recalculateAppearance(state, data, parentData);
    data.lastAppearanceID = appearanceID;
    return true;
  }
  return false;
}

function recalculateAppearance(state: RenderState, data: RenderProxy, parentData?: RenderProxy) {
  const source = data.source as unknown as HasAppearance;
  if (parentData !== undefined) {
    data.visible = source.visible && parentData.visible;
    if (!data.visible) return;
    data.alpha = source.alpha * parentData.alpha;
    if (data.alpha <= 0) return;
    data.blendMode = source.blendMode;
  } else {
    data.visible = source.visible;
    if (!data.visible) return;
    data.alpha = source.alpha * state.renderAlpha;
    if (data.alpha <= 0) return;
    data.blendMode = state.renderBlendMode !== null ? state.renderBlendMode : source.blendMode;
  }
  data.appearanceFrameID = getRenderStateRuntime(state).currentFrameID;
}
