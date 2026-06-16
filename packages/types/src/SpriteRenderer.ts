import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderNode2D } from './RenderNode2D';
import type { RenderState } from './RenderState';
import type { Sprite } from './Sprite';

export interface SpriteRenderer extends Renderer {
  createData(state: RenderState, source: Sprite): RendererData | null;
  submit(state: RenderState, node: RenderNode2D): void;
}
