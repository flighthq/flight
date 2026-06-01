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
  out.scrollRectDepth = 0;
  return out;
}

export function createRenderNode2D(
  state: RenderState,
  source: Renderable & HasTransform2D & HasBoundsRect,
): RenderNode2D {
  const out = createRenderNode(state, source) as RenderNode2D;
  out.transform2D = createMatrix();
  return out;
}

export function createSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  return createRenderNode2D(state, source) as SpriteRenderNode;
}

export function getOrCreateDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  return getOrCreateRenderNode(state, source, createDisplayObjectRenderNode);
}

export function getOrCreateSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  return getOrCreateRenderNode(state, source, createSpriteRenderNode);
}
