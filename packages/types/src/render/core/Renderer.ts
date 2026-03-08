import type { Renderable } from './Renderable';
import type { RendererData } from './RendererData';
import type { RenderNode } from './RenderNode';
import type { RenderState } from './RenderState';

export interface Renderer {
  createData(state: RenderState, source: Renderable): RendererData | null;
  drawMask(state: RenderState, node: RenderNode): void;
  draw(state: RenderState, node: RenderNode): void;
}
