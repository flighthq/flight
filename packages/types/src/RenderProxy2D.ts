import type { Matrix } from './Matrix';
import type { RenderProxy } from './RenderProxy';

// The unified 2D render node. Sprites and display objects share one render node type; the mask and
// clip-rectangle fields are inert for nodes that do not use them. Keeping a single type frees the
// render walk from per-graph render-node types and the casts they require.
export interface RenderProxy2D extends RenderProxy {
  transform2D: Matrix;
  traverseChildren: boolean;
  isMaskFrameID: number;
  maskDepth: number;
  clipRectangleDepth: number;
}
