import type { Renderable } from './Renderable';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

// Per-node update callback for the render walks. Receives the source node and its render node plus
// the parent's render node; composes the trait update* steps (appearance, transform, material, clip).
export type RenderProxyVisitor = (
  state: RenderState,
  source: Renderable,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
) => void;
