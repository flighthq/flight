import { getAppearanceRevision, getLocalTransformRevision, getSceneNodeRuntime } from '@flighthq/scene';
import type { Renderable, RenderNode, RenderNode2D, RenderState, SceneNode } from '@flighthq/types';

import { syncRenderNodeRenderer } from './renderNode';

export function adaptRenderNode(
  state: RenderState,
  source: Renderable,
  data: RenderNode2D & { traverseChildren: boolean },
): void {
  const resolver = getSceneNodeRuntime(source as SceneNode).resolver;
  data.resolver = resolver;
  let traverseChildren = true;
  if (resolver !== null) {
    const result = resolver.adapt(state, source, data);
    if (result !== null) {
      traverseChildren = result;
      syncRenderNodeRenderer(state, data);
    }
  }
  data.traverseChildren = traverseChildren;
}

export function beginRenderNodeUpdate(_source: Renderable, _data: RenderNode): void {}

export function isRenderNodeDirty(
  state: RenderState,
  source: Renderable,
  data: RenderNode,
  parentData?: RenderNode,
): boolean {
  const runtime = getSceneNodeRuntime(source as SceneNode);
  const parentDirty =
    parentData !== undefined &&
    (parentData.transformFrameID === state.currentFrameID || parentData.appearanceFrameID === state.currentFrameID);
  const localDirty =
    data.lastLocalTransformID !== getLocalTransformRevision(source as SceneNode) ||
    data.lastAppearanceID !== getAppearanceRevision(source as SceneNode);
  const resolverDirty = data.resolver !== runtime.resolver;
  return parentDirty || localDirty || resolverDirty;
}
