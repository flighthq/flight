// Generated from crates/flight-collision/src/contact_feature_id.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export const FEATURE_INDEX_LIMIT: number = 1 << 25;

export function packContactFeatureId(
  referenceIsA: boolean,
  referenceEdge: number,
  incidentEdge: number,
  secondPoint: boolean,
): number {
  const refFlag = referenceIsA ? 1 : 0;
  const second = secondPoint ? 1 : 0;
  return (
    refFlag * FEATURE_INDEX_LIMIT * FEATURE_INDEX_LIMIT * 2 +
    referenceEdge * FEATURE_INDEX_LIMIT * 2 +
    incidentEdge * 2 +
    second
  );
}
