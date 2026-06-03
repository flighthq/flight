import { getSceneNodeRuntime } from '@flighthq/scene';
import type { DisplayObject, DisplayObjectRenderNode, RenderState } from '@flighthq/types';

import type { RenderNodeStateInternal } from './renderNodeInternal';

export type DisplayObjectRenderNodeResolution = {
  dirty?: boolean;
  node: DisplayObjectRenderNode;
  updateChildren: boolean;
};

export type DisplayObjectRenderNodeResolver = (
  state: RenderState,
  source: DisplayObject,
  next: () => DisplayObjectRenderNode,
) => DisplayObjectRenderNodeResolution | null;

export function registerDisplayObjectRenderNodeResolver(
  state: RenderState,
  resolver: DisplayObjectRenderNodeResolver,
): void {
  (state as RenderNodeStateInternal).displayObjectRenderNodeResolvers.push(resolver);
}

export function resolveDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
  next: () => DisplayObjectRenderNode,
): DisplayObjectRenderNodeResolution {
  const nodeResolver = getSceneNodeRuntime(source).resolver;
  if (nodeResolver !== null) {
    const result = nodeResolver.resolve(state, source, next);
    if (result !== null) {
      result.node.updateChildren = nodeResolver.updateChildren;
      return { node: result.node, updateChildren: nodeResolver.updateChildren, dirty: result.dirty };
    }
  }

  const resolvers = (state as RenderNodeStateInternal).displayObjectRenderNodeResolvers;
  for (let i = 0; i < resolvers.length; i++) {
    const result = resolvers[i](state, source, next);
    if (result !== null) {
      result.node.updateChildren = result.updateChildren;
      return result;
    }
  }

  const node = next();
  node.updateChildren = true;
  return { node, updateChildren: true };
}
