import type { NodeAny } from './Node.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';
import type { RenderState } from './RenderState.ts';

// Per-node update callback for the render walks. Receives the source node and its render node plus
// the parent's render node; composes the trait update* steps (appearance, transform, material, clip).
export type RenderProxyVisitor = (
  state: RenderState,
  source: NodeAny,
  data: RenderProxy2D,
  parentData: RenderProxy2D | undefined,
) => void;
