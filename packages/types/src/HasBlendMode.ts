import type { BlendMode } from './BlendMode';
import type { Node, NodeTraits } from './Node';

// Per-instance fixed-function compositing over the backdrop for 2D-style nodes (Normal/Add/Multiply/
// Screen/…). Unlike `alpha`/`visible` it does NOT propagate down the hierarchy — each node composites
// on its own, so setting it affects only that node. 3D nodes omit this trait: 3D transparency is a
// material property (SurfaceMaterial), and advanced non-separable blend is a `BlendEffect` recipe.
export interface HasBlendMode {
  blendMode: BlendMode | null;
}

export type BlendModeNode<Traits extends object = NodeTraits> = Node<Traits> & HasBlendMode;
