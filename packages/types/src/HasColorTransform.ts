import type { ColorTransform } from './ColorTransform';
import type { Node, NodeTraits } from './Node';

// Node trait carrying a node-level color transform — the Adjustment tier's pointwise value remap
// (`color = color * mult + offset`) folded into the draw, not a material. A display object owns this
// trait (default `null` → no tint); `updateRenderProxyColorTransform` resolves it onto the render
// node during the render walk. It never keys the batch: a tinted and an untinted node with the same
// texture and blend batch together, the batch promoting to the color-transform shader variant when
// any member is tinted (a whole-batch tint realizes as one uniform; tints that vary across a batch
// realize as per-instance attributes — by data cardinality, not a mode flag).
export interface HasColorTransform {
  colorTransform: ColorTransform | null;
}

export type ColorTransformNode<Traits extends object = NodeTraits> = Node<Traits> & HasColorTransform;
