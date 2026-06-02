import type { RenderTreeNode2D } from './RenderTreeNode2D';
import type { SpriteNode } from './SpriteNode';

export interface SpriteRenderTreeNode extends RenderTreeNode2D {
  readonly source: SpriteNode;
}
