import type { DisplayObject } from '../../scene/graph/display/DisplayObject';
import type { DisplayObjectRenderNode } from './DisplayObjectRenderNode';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';

export interface DisplayObjectRenderer extends Renderer {
  createData(state: RenderState, source: DisplayObject): RendererData | null;
  drawMask(state: RenderState, node: DisplayObjectRenderNode): void;
  draw(state: RenderState, node: DisplayObjectRenderNode): void;
}
