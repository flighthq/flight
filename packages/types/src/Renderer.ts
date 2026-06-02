import type { Renderable } from './Renderable';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';
import type { RenderTreeNode } from './RenderTreeNode';

export interface Renderer {
  createData(state: RenderState, source: Renderable): RendererData | null;
  draw(state: RenderState, node: RenderTreeNode): void;
}
