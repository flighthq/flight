import { matrix3x2 } from '@flighthq/geometry';
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

import { createRenderNode, getRenderNode } from './renderNode';

export function createDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  const out = createRenderNode2D(state, source) as DisplayObjectRenderNode;
  out.cacheAsBitmap = false;
  out.cacheBitmap = null;
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
  out.transform2D = matrix3x2.create();
  return out;
}

export function createSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  return createRenderNode2D(state, source) as SpriteRenderNode;
}

export function getDisplayObjectRenderNode(state: RenderState, source: DisplayObject): DisplayObjectRenderNode {
  return getRenderNode(state, source, createDisplayObjectRenderNode);
}

export function getSpriteRenderNode(state: RenderState, source: SpriteNode): SpriteRenderNode {
  return getRenderNode(state, source, createSpriteRenderNode);
}
