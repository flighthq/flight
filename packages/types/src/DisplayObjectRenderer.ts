import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectRenderNode } from './DisplayObjectRenderNode';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';

export interface DisplayObjectRenderer extends Renderer {
  createData(state: RenderState, source: DisplayObject): RendererData | null;
  draw(state: RenderState, node: DisplayObjectRenderNode): void;
}

export interface DisplayObjectMaskRenderer {
  drawMask(state: RenderState, node: DisplayObjectRenderNode): void;
}

export interface DisplayObjectMaskHooks {
  popMask(state: RenderState): void;
  pushMask(state: RenderState, node: DisplayObjectRenderNode, context?: unknown): void;
}

export interface ScrollRectangleHooks {
  pop(state: RenderState): void;
  push(state: RenderState, data: DisplayObjectRenderNode): void;
}
