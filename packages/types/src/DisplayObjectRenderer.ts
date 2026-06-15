import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectRenderNode } from './DisplayObjectRenderNode';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderNode } from './RenderNode';
import type { RenderState } from './RenderState';

export interface DisplayObjectRenderer extends Renderer {
  createData(state: RenderState, source: DisplayObject): RendererData | null;
  submit(state: RenderState, node: DisplayObjectRenderNode): void;
}

export interface DisplayObjectMaskRenderer {
  drawMask(state: RenderState, node: DisplayObjectRenderNode): void;
}

export interface AppearanceHooks {
  update(state: RenderState, data: RenderNode, parentData: RenderNode | undefined): void;
}

export interface DisplayObjectClipHooks {
  finalize(state: RenderState): void;
  popMask(state: RenderState, data: DisplayObjectRenderNode): void;
  popClipRectangle(state: RenderState, data: DisplayObjectRenderNode): void;
  pushMask(state: RenderState, source: DisplayObject): void;
  pushClipRectangle(
    state: RenderState,
    data: DisplayObjectRenderNode,
    source: DisplayObject,
    hasChildren: boolean,
  ): void;
}
