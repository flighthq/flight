import type { ColorTransform } from './ColorTransform';
import type { Node, NodeTraits, NullScene } from './Node';

// Opt-in node trait carrying a per-node color transform. A freshly created node does not
// have this trait — color transform is no longer part of the universal HasAppearance set,
// because it is GPU-specific intent that Canvas realizes through offscreen filters, not a
// material. The trait supplies the value consumed by ColorTransformMaterial, which packs it
// per-instance so independently-tinted nodes still batch together.
//
// updateNodeColorTransform resolves this onto the render node during the render walk.
export interface HasColorTransform {
  colorTransform: ColorTransform | null;
}

export type GraphColorTransformNode<Kind extends symbol = typeof NullScene, Traits extends object = NodeTraits> = Node<
  Kind,
  Traits
> &
  HasColorTransform;
