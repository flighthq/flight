import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';
import type { Sprite } from './Sprite';
import type { SpriteRenderTreeNode } from './SpriteRenderTreeNode';

export interface SpriteRenderer extends Renderer {
  createData(state: RenderState, source: Sprite): RendererData | null;
  draw(state: RenderState, node: SpriteRenderTreeNode): void;
}
