import { getSceneNodeRuntime } from '@flighthq/scene';
import type { DisplayObject, DisplayObjectRenderNode, RenderNodeResolver, RenderState } from '@flighthq/types';

type RenderNodeResolverInternal = RenderNodeResolver & {
  getNode: (state: RenderState, source: DisplayObject) => DisplayObjectRenderNode;
};

export function resolveDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
  next: () => DisplayObjectRenderNode,
): DisplayObjectRenderNode {
  const resolver = getSceneNodeRuntime(source).resolver as RenderNodeResolverInternal | null;
  if (resolver !== null) {
    const updateChildren = resolver.resolve(state, source);
    if (updateChildren !== null) {
      const node = resolver.getNode(state, source);
      node.updateChildren = updateChildren;
      return node;
    }
  }
  const node = next();
  node.updateChildren = true;
  return node;
}
