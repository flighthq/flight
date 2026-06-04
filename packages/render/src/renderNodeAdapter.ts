import { getAppearanceRevision, getLocalTransformRevision, getSceneNodeRuntime } from '@flighthq/scene';
import type { Renderable, RenderNode, RenderNode2D, RenderNodeAdapter, RenderState, SceneNode } from '@flighthq/types';

import { syncRenderNodeRenderer } from './renderNode';

export function adaptRenderNode(
  state: RenderState,
  source: Renderable,
  data: RenderNode2D & { updateChildren: boolean },
): void {
  const resolver = data.resolver;
  let updateChildren = true;
  if (resolver !== null) {
    const result = (resolver as RenderNodeAdapter).adapt(state, source, data);
    if (result !== null) {
      updateChildren = result;
      syncRenderNodeRenderer(state, data);
    }
  }
  data.updateChildren = updateChildren;
}

export function beginRenderNodeUpdate(source: Renderable, data: RenderNode): void {
  data.resolver = getSceneNodeRuntime(source as SceneNode).resolver;
  data.source = source;
  data.lastLocalTransformID = -1;
}

export function isRenderNodeDirty(
  state: RenderState,
  source: Renderable,
  data: RenderNode,
  parentData?: RenderNode,
): boolean {
  const parentDirty =
    parentData !== undefined &&
    (parentData.transformFrameID === state.currentFrameID || parentData.appearanceFrameID === state.currentFrameID);
  const localDirty =
    data.lastLocalTransformID !== getLocalTransformRevision(source as SceneNode) ||
    data.lastAppearanceID !== getAppearanceRevision(source as SceneNode);
  return parentDirty || localDirty;
}
