import type { RenderNode2D } from './RenderNode2D';
import type { SpriteNode } from './SpriteNode';

export interface SpriteRenderNode extends RenderNode2D {
  readonly source: SpriteNode;
}
