import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectRenderTreeNode } from './DisplayObjectRenderTreeNode';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';

export interface DisplayObjectRenderer extends Renderer {
  createData(state: RenderState, source: DisplayObject): RendererData | null;
  drawMask(state: RenderState, node: DisplayObjectRenderTreeNode): void;
  draw(state: RenderState, node: DisplayObjectRenderTreeNode): void;
}
