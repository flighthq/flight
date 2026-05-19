import type { SpriteNode } from '../scenegraph-sprite';
import type { RenderNode2D } from './RenderNode2D';

export interface SpriteRenderNode extends RenderNode2D {
  readonly source: SpriteNode;
}
