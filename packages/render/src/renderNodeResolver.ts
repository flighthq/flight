import { getSceneNodeRuntime } from '@flighthq/scene';
import type { DisplayObject, DisplayObjectRenderNode, Matrix, RenderNodeResolver, RenderState } from '@flighthq/types';

type RenderNodeResolverInternal = RenderNodeResolver & {
  getNode: (state: RenderState, source: DisplayObject) => DisplayObjectRenderNode;
};

export function resolveDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
  next: () => DisplayObjectRenderNode,
  parentTransform: Matrix | null,
): DisplayObjectRenderNode {
  const resolver = getSceneNodeRuntime(source).resolver as RenderNodeResolverInternal | null;
  if (resolver !== null) {
    const updateChildren = resolver.resolve(state, source, parentTransform);
    if (updateChildren !== null) {
      const node = resolver.getNode(state, source);
      node.updateChildren = updateChildren;
      node.resolver = resolver;
      return node;
    }
  }
  const node = next();
  node.updateChildren = true;
  node.resolver = null;
  return node;
}
