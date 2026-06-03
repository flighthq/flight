import type { Renderable } from './Renderable';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';
import type { RenderNode } from './RenderNode';

export interface Renderer {
  createData(state: RenderState, source: Renderable): RendererData | null;
  draw(state: RenderState, node: RenderNode): void;
}
