// Contact feature identity: the packing that lets a solver recognise, next frame, that it is looking
// at the same contact and may reuse the impulse it converged on. Private to the package — the packed
// value is opaque to callers, so only `CollisionContactPoint2D.featureId` crosses the boundary.

// The largest vertex count whose face indices still pack without aliasing. Face indices take 25 bits
// each, above a 1-bit contact-point slot and below the reference-shape bit. A convex polygon at this
// bound carries 67 million coordinates.
export const FEATURE_INDEX_LIMIT = 1 << 25;

// Packs the four components that identify a contact feature — which shape owned the reference face,
// which face of each shape met, and which end of the clipped span this point is — into one opaque
// integer.
//
// Positional multiplication, not bit shifts. `<<` truncates to 32 bits, so a shift-packed id silently
// WRAPS once a face index outgrows its field, and two unrelated face pairs collide on one id. That is
// not a crash: it is a solver warm-starting a contact with an impulse belonging to somewhere else on
// the shape, which surfaces as jitter that no stack trace explains. Here each field's scale exceeds
// the largest value packed below it, so distinct components can never sum to the same id, and the
// widest possible id is 2^52 - 1 — inside the exact-integer range, so no id is ever rounded.
export function packContactFeatureId(
  referenceIsA: boolean,
  referenceEdge: number,
  incidentEdge: number,
  secondPoint: boolean,
): number {
  return (
    (referenceIsA ? FEATURE_REFERENCE_SCALE : 0) +
    referenceEdge * FEATURE_EDGE_SCALE +
    incidentEdge * 2 +
    (secondPoint ? 1 : 0)
  );
}

const FEATURE_EDGE_SCALE = FEATURE_INDEX_LIMIT * 2;
const FEATURE_REFERENCE_SCALE = FEATURE_INDEX_LIMIT * FEATURE_EDGE_SCALE;
