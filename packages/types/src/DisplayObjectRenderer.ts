import type { DisplayObject } from './DisplayObject';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

export interface DisplayObjectRenderer extends Renderer {
  createData(state: RenderState, source: DisplayObject): RendererData | null;
  submit(state: RenderState, node: RenderProxy2D): void;
}

export interface DisplayObjectMaskRenderer {
  drawMask(state: RenderState, node: RenderProxy2D): void;
}

export interface DisplayObjectClipHooks {
  finalize(state: RenderState): void;
  popMask(state: RenderState, data: RenderProxy2D): void;
  // `source` lets the implementation pop down to the node's parent clip depth (excluding the node's
  // own clip), so consecutive sibling clips at the same depth do not leak into one another.
  popClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject): void;
  pushMask(state: RenderState, source: DisplayObject): void;
  // Pushed before the node draws its own content, so a clip rectangle clips the node itself and its
  // children (like scrollRect minus the scroll), not only its children.
  pushClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject): void;
}
