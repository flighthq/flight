import type { Matrix } from './Matrix';
import type { RenderProxy } from './RenderProxy';

// The unified 2D render node. Sprites and display objects share one render node type; the clip field is
// inert for nodes that do not use it. Keeping a single type frees the render walk from per-graph
// render-node types and the casts they require.
export interface RenderProxy2D extends RenderProxy {
  transform2D: Matrix;
  traverseChildren: boolean;
  // Clip nesting depth at this node (rect + path clips); the backend unwinds its clip gates to this on
  // exit. Masks were retired into clips, so the former isMaskFrameId/maskDepth fields are gone.
  clipDepth: number;
}
