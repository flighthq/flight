import type { DisplayObject } from './DisplayObject';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

export interface DisplayObjectRenderer extends Renderer {
  createData(state: RenderState, source: DisplayObject): RendererData | null;
  submit(state: RenderState, node: RenderProxy2D): void;
}

// Realizes a node's `clip` (ClipRegion): a rectangle as a scissor, an arbitrary path as stencil-then-
// cover (or CSS clip-path on DOM). Masks were retired into this — a former mask is a path ClipRegion.
export interface DisplayObjectClipHooks {
  finalize(state: RenderState): void;
  // `source` lets the implementation pop down to the node's parent clip depth (excluding the node's
  // own clip), so consecutive sibling clips at the same depth do not leak into one another.
  popClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void;
  // Pushed before the node draws its own content, so a clip clips the node itself and its children
  // (like scrollRect minus the scroll), not only its children.
  pushClip(state: RenderState, data: RenderProxy2D, source: DisplayObject): void;
}
