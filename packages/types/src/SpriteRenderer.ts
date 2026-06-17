import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';
import type { Sprite } from './Sprite';

export interface SpriteRenderer extends Renderer {
  createData(state: RenderState, source: Sprite): RendererData | null;
  submit(state: RenderState, node: RenderProxy2D): void;
}
