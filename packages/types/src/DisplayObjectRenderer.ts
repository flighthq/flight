import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectRenderTreeNode } from './DisplayObjectRenderTreeNode';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';

export interface DisplayObjectRenderer extends Renderer {
  createData(state: RenderState, source: DisplayObject): RendererData | null;
  draw(state: RenderState, node: DisplayObjectRenderTreeNode): void;
}

export interface DisplayObjectMaskRenderer {
  drawMask(state: RenderState, node: DisplayObjectRenderTreeNode): void;
}

export interface DisplayObjectMaskHooks {
  popMask(state: RenderState, node: DisplayObjectRenderTreeNode, context?: unknown): void;
  pushMask(state: RenderState, node: DisplayObjectRenderTreeNode, context?: unknown): void;
}

export interface ScrollRectHooks {
  pop(state: RenderState): void;
  push(state: RenderState, data: DisplayObjectRenderTreeNode): void;
}
