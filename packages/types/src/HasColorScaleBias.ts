import type { ColorScaleBias } from './ColorScaleBias';
import type { NodeOf, NodeTraits } from './Node';

// Node trait carrying a node-level color scale/bias — the Adjustment tier's pointwise value remap
// (`color = color * scale + bias`) folded into the draw, not a material. A node owns this trait
// (default `null` → no tint); the resolver installed by `enableColorAdjustments` resolves it onto the render
// node during the render walk. It never keys the batch: a tinted and an untinted node with the same
// texture and blend batch together, the batch promoting to the color-adjustment shader variant when
// any member is tinted (a whole-batch tint realizes as one uniform; tints that vary across a batch
// realize as per-instance attributes — by data cardinality, not a mode flag).
export interface HasColorScaleBias {
  colorScaleBias: ColorScaleBias | null;
}

export type ColorScaleBiasNode<Traits extends object = NodeTraits> = NodeOf<Traits> & HasColorScaleBias;
