import type { Renderable } from './Renderable';
import type { RendererData } from './RendererData';
import type { RendererState } from './RendererState';
import type { RenderNode } from './RenderNode';

export interface Renderer {
  applyMask(state: RendererState, node: RenderNode): void;
  createData(state: RendererState, source: Renderable): RendererData | null;
  render(state: RendererState, node: RenderNode): void;
}
