import type { NodeRenderer } from './NodeRenderer.ts';
import type { RendererData } from './RendererData.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';
import type { RenderState } from './RenderState.ts';
import type { Sprite } from './Sprite.ts';

export interface SpriteRenderer extends NodeRenderer {
  createData(state: RenderState, source: Sprite): RendererData | null;
  submit(state: RenderState, node: RenderProxy2D): void;
}
