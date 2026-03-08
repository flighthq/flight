import type { Sprite } from '../../scene/graph/sprite/Sprite';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderState } from './RenderState';
import type { SpriteRenderNode } from './SpriteRenderNode';

export interface SpriteRenderer extends Renderer {
  createData(state: RenderState, source: Sprite): RendererData | null;
  draw(state: RenderState, node: SpriteRenderNode): void;
}
