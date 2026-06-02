import { createMatrix } from '@flighthq/geometry';
import type {
  DisplayObject,
  DisplayObjectRenderTreeNode,
  HasBoundsRect,
  HasTransform2D,
  Renderable,
  RenderState,
  RenderTreeNode2D,
  SpriteNode,
  SpriteRenderTreeNode,
} from '@flighthq/types';

import { resolveDisplayObjectRenderNode } from './renderNodeResolver';
import { createRenderNode, getOrCreateRenderNode } from './renderTreeNode';

export function createDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderTreeNode {
  const out = createRenderNode2D(state, source) as DisplayObjectRenderTreeNode;
  out.isMaskFrameID = -1;
  out.maskDepth = 0;
  out.scrollRectDepth = 0;
  out.updateChildren = true;
  return out;
}

export function createRenderNode2D(
  state: RenderState,
  source: Renderable & HasTransform2D & HasBoundsRect,
): RenderTreeNode2D {
  const out = createRenderNode(state, source) as RenderTreeNode2D;
  out.presentationTransform2D = null;
  out.transform2D = createMatrix();
  return out;
}

export function createSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderTreeNode {
  return createRenderNode2D(state, source) as SpriteRenderTreeNode;
}

export function getOrCreateDefaultDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
): DisplayObjectRenderTreeNode {
  return getOrCreateRenderNode(state, source, createDisplayObjectRenderNode);
}

export function getOrCreateDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
): DisplayObjectRenderTreeNode {
  return resolveDisplayObjectRenderNode(state, source, () => getOrCreateDefaultDisplayObjectRenderNode(state, source))
    .node;
}

export function getOrCreateSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderTreeNode {
  return getOrCreateRenderNode(state, source, createSpriteRenderNode);
}
