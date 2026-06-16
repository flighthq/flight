import type { DisplayObject } from './DisplayObject';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderNode2D } from './RenderNode2D';
import type { RenderState } from './RenderState';

export interface DisplayObjectRenderer extends Renderer {
  createData(state: RenderState, source: DisplayObject): RendererData | null;
  submit(state: RenderState, node: RenderNode2D): void;
}

export interface DisplayObjectMaskRenderer {
  drawMask(state: RenderState, node: RenderNode2D): void;
}

export interface DisplayObjectClipHooks {
  finalize(state: RenderState): void;
  popMask(state: RenderState, data: RenderNode2D): void;
  popClipRectangle(state: RenderState, data: RenderNode2D): void;
  pushMask(state: RenderState, source: DisplayObject): void;
  pushClipRectangle(state: RenderState, data: RenderNode2D, source: DisplayObject, hasChildren: boolean): void;
}
