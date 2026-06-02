import { getSceneNodeRuntime } from '@flighthq/scene';
import type { DisplayObject, DisplayObjectRenderTreeNode, RenderState } from '@flighthq/types';

import type { RenderTreeStateInternal } from './internal';

export type DisplayObjectRenderNodeResolution = {
  dirty?: boolean;
  node: DisplayObjectRenderTreeNode;
  updateChildren: boolean;
};

export type DisplayObjectRenderNodeResolver = (
  state: RenderState,
  source: DisplayObject,
  next: () => DisplayObjectRenderTreeNode,
) => DisplayObjectRenderNodeResolution | null;

export function registerDisplayObjectRenderNodeResolver(
  state: RenderState,
  resolver: DisplayObjectRenderNodeResolver,
): void {
  (state as RenderTreeStateInternal).displayObjectRenderNodeResolvers.push(resolver);
}

export function resolveDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
  next: () => DisplayObjectRenderTreeNode,
): DisplayObjectRenderNodeResolution {
  const nodeResolver = getSceneNodeRuntime(source).resolver;
  if (nodeResolver !== null) {
    const result = nodeResolver.resolve(state, source, next);
    if (result !== null) {
      result.node.updateChildren = nodeResolver.updateChildren;
      return { node: result.node, updateChildren: nodeResolver.updateChildren, dirty: result.dirty };
    }
  }

  const resolvers = (state as RenderTreeStateInternal).displayObjectRenderNodeResolvers;
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
