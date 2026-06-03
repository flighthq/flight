import { getAppearanceRevision } from '@flighthq/scene';
import type { HasAppearance, RenderState, RenderTreeNode, SceneNode } from '@flighthq/types';
import { BlendMode, RenderFeatures } from '@flighthq/types';

import { updateRenderNodeColorTransform } from './renderNodeColor';
import { hasRenderFeatures } from './renderer';

export function updateRenderNodeAppearance(
  state: RenderState,
  data: RenderTreeNode,
  parentData?: RenderTreeNode,
): boolean {
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

function recalculateAppearance(state: RenderState, data: RenderTreeNode, parentData?: RenderTreeNode) {
  const source = data.source as HasAppearance;
  const hasBlendMode = hasRenderFeatures(state, RenderFeatures.BlendMode);
  const hasColorTransform = hasRenderFeatures(state, RenderFeatures.ColorTransform);
  const hasShaders = hasRenderFeatures(state, RenderFeatures.Shaders);
  if (parentData !== undefined) {
    data.visible = source.visible && parentData.visible;
    if (!data.visible) return;
    data.alpha = source.alpha * parentData.alpha;
    if (data.alpha <= 0) return;
    if (hasColorTransform) updateRenderNodeColorTransform(state, data, parentData);
    else data.useColorTransform = false;
    data.blendMode =
      hasBlendMode && parentData.blendMode !== BlendMode.Normal ? parentData.blendMode : source.blendMode;
    if (!hasBlendMode) data.blendMode = BlendMode.Normal;
    data.shader = hasShaders ? (parentData.shader !== null ? parentData.shader : source.shader) : null;
  } else {
    data.visible = source.visible;
    if (!data.visible) return;
    data.alpha = source.alpha * state.renderAlpha;
    if (data.alpha <= 0) return;
    if (hasColorTransform) updateRenderNodeColorTransform(state, data);
    else data.useColorTransform = false;
    data.blendMode = hasBlendMode
      ? state.renderBlendMode !== null
        ? state.renderBlendMode
        : source.blendMode
      : BlendMode.Normal;
    data.shader = hasShaders ? (state.renderShader !== null ? state.renderShader : source.shader) : null;
  }
  data.appearanceFrameID = state.currentFrameID;
}
