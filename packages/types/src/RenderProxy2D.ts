import type { Material2D } from './Material2D';
import type { Matrix } from './Matrix';
import type { Node2D } from './Node2D';
import type { RenderProxy } from './RenderProxy';

// The unified 2D render node. Sprites and display objects share one render node type; the clip field is
// inert for nodes that do not use it. Keeping a single type frees the render walk from per-graph
// render-node types and the casts they require.
export interface RenderProxy2D extends RenderProxy {
  // Narrowed from RenderProxy.material, which stays the widest type for the material-agnostic walk
  // infrastructure. The 2D walk populates this from HasMaterial.material, already Material2D | null,
  // so the quad resolve reads it with no cast and no runtime dimensionality check.
  material: Material2D | null;
  // Narrowed from RenderProxy.source, which stays NodeAny for the base walk that also carries 3D
  // proxies. The 2D walk consumes the complete Node2DTraits family, so retaining that concrete family
  // keeps its runtime callbacks and hierarchy specialised without a Node<any> erasure.
  source: Node2D;
  transform2D: Matrix;
  traverseChildren: boolean;
  // Clip nesting depth at this node (rect + path clips); the backend unwinds its clip gates to this on
  // exit. Masks were retired into clips, so the former isMaskFrameId/maskDepth fields are gone.
  clipDepth: number;
}
