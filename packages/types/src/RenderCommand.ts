import type { RenderNode2D } from './RenderNode2D';

export interface RenderCommand {
  kind: number;
  node: RenderNode2D;
}
