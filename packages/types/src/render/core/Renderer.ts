import type { Renderable } from './Renderable';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';
import type { RenderNode } from './RenderNode';

export interface Renderer {
  applyMask(state: RenderState, node: RenderNode): void;
  createData(state: RenderState, source: Renderable): RendererData | null;
  render(state: RenderState, node: RenderNode): void;
}
