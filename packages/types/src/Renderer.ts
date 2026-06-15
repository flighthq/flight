import type { Renderable } from './Renderable';
import type { RendererData } from './RendererData';
import type { RenderNode } from './RenderNode';
import type { RenderState } from './RenderState';

export interface Renderer {
  createData(state: RenderState, source: Renderable): RendererData | null;
  submit(state: RenderState, node: RenderNode): void;
}
