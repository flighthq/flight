import { createMatrix } from '@flighthq/geometry';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  HasBoundsRect,
  HasTransform2D,
  Renderable,
  RenderNode2D,
  RenderState,
  SpriteNode,
  SpriteRenderNode,
} from '@flighthq/types';

import { createRenderNode, getOrCreateRenderNode } from './renderNode';

export function createDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  const out = createRenderNode2D(state, source) as DisplayObjectRenderNode;
  out.isMaskFrameID = -1;
  out.maskDepth = 0;
  out.scrollRectangleDepth = 0;
  out.updateChildren = true;
  return out;
}

export function createRenderNode2D(
  state: RenderState,
  source: Renderable & HasTransform2D & HasBoundsRect,
): RenderNode2D {
  const node = createRenderNode(state, source) as RenderNode2D;
  node.transform2D = createMatrix();
  return node;
}

export function createSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  const out = createRenderNode2D(state, source) as SpriteRenderNode;
  out.updateChildren = true;
  return out;
}

export function getOrCreateDefaultDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
): DisplayObjectRenderNode {
  return getOrCreateRenderNode(state, source, createDisplayObjectRenderNode);
}

export function getOrCreateDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  return getOrCreateDefaultDisplayObjectRenderNode(state, source);
}

export function getOrCreateSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  return getOrCreateRenderNode(state, source, createSpriteRenderNode);
}
