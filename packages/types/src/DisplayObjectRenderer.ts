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

export interface DisplayObjectClipHooks {
  finalize(state: RenderState): void;
  popMask(state: RenderState, data: DisplayObjectRenderNode): void;
  popScrollRectangle(state: RenderState, data: DisplayObjectRenderNode): void;
  pushMask(state: RenderState, source: DisplayObject): void;
  pushScrollRectangle(
    state: RenderState,
    data: DisplayObjectRenderNode,
    source: DisplayObject,
    hasChildren: boolean,
  ): void;
}
