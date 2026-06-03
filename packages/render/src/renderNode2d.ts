import type {
  DisplayObject,
  DisplayObjectRenderNode,
  HasBoundsRect,
  HasTransform2D,
  Matrix,
  Renderable,
  RenderNode2D,
  RenderState,
  SpriteNode,
  SpriteRenderNode,
} from '@flighthq/types';

import { createRenderNode, getOrCreateRenderNode } from './renderNode';
import { resolveDisplayObjectRenderNode } from './renderNodeResolver';

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
  return createRenderNode(state, source) as RenderNode2D;
}

export function createSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  return createRenderNode2D(state, source) as SpriteRenderNode;
}

export function getOrCreateDefaultDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
): DisplayObjectRenderNode {
  return getOrCreateRenderNode(state, source, createDisplayObjectRenderNode);
}

export function getOrCreateDisplayObjectRenderNode(
  state: RenderState,
  source: DisplayObject,
  parentTransform: Matrix | null = null,
): DisplayObjectRenderNode {
  return resolveDisplayObjectRenderNode(
    state,
    source,
    () => getOrCreateDefaultDisplayObjectRenderNode(state, source),
    parentTransform,
  );
}

export function getOrCreateSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  return getOrCreateRenderNode(state, source, createSpriteRenderNode);
}
