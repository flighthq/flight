// What a material conversion silently discarded. A converter between two material models writes an
// `out` and returns nothing, so a map it cannot carry across leaves no trace: the result is a materially
// different surface — flat where the source was textured — with no runtime signal at all. This is the
// plain-data half of that seam, per the diagnostics inversion rule.
//
// `droppedMaps` names the SOURCE fields that were discarded, so a caller reads what it lost rather than
// what it kept. Empty when the conversion carried everything the target model can hold, which is the
// common case and the one worth being able to distinguish.
//
// `reason` states WHY each drop is not a bug to fix in the converter: a packed map cannot be reassigned
// to a target slot whose channel and colour-space semantics differ, so carrying it across requires an
// explicit bake step rather than a field copy.
export interface MaterialConversionExplanation {
  droppedMaps: readonly string[];
  reason: MaterialConversionDropReason | null;
}

// `incompatible-channel-semantics` — the source map packs different quantities in its channels than the
// target slot expects, so no assignment preserves meaning. The remedy is an explicit bake, never a copy.
// `unsupported-by-target-model` — the target model has no slot for this quantity at all.
export type MaterialConversionDropReason = 'incompatible-channel-semantics' | 'unsupported-by-target-model';

// The seam a material converter reports a dropped map through. Null in production, so the check costs
// nothing and the message lives in the separately-imported guard module. `conversion` names the function
// that dropped it, because a caller with several conversions in flight needs to know which one.
export type MaterialConversionGuard = (
  explanation: Readonly<MaterialConversionExplanation>,
  conversion: string,
) => void;
