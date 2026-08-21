// Combines two Coulomb friction coefficients symmetrically. The geometric mean preserves the two
// properties authoring depends on: equal surfaces keep their coefficient, and either surface choosing
// zero makes the pair frictionless. Taking each square root before multiplying avoids an intermediate
// overflow for large but finite coefficients.
export function mixPhysics3DFriction(first: number, second: number): number {
  return Math.sqrt(first) * Math.sqrt(second);
}

// A contact uses the bouncier surface's restitution. Kept beside friction mixing so callers that author
// or inspect contacts can predict both combined values without duplicating step internals.
export function mixPhysics3DRestitution(first: number, second: number): number {
  return Math.max(first, second);
}
