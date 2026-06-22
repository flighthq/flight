import type { Entity, Kind } from './Entity';

// Light DATA descriptors for single-pass forward lighting. Pure data — color/intensity/range/
// cone/shadow params only; placement comes from the owning scene node's transform in a later
// pass, not from these structs. Each variant carries a `kind` discriminant (one of the exported
// *Kind strings) so a packer can switch on light type.
//
// Color is packed sRgb-albedo RGBA (0xrrggbbaa); a packed 8-bit integer cannot carry HDR, so a
// light's linear radiance is unpackColorToLinear(color) × intensity (the single sRgb->linear
// seam in @flighthq/materials). `range` is the falloff cutoff distance in world units, with -1
// meaning infinite (no attenuation cutoff) for the punctual lights that support it.
//
// Shadow params, on lights that cast: `castsShadow` opts in; `shadowBias` (depth-compare bias)
// and `normalBias` (surface-offset along the normal) fight shadow acne / peter-panning;
// `pcfRadius` is the percentage-closer-filtering kernel radius in shadow-map texels.

// Open base contract for every light. The `kind` is the canonical PascalCase type name; concrete
// lights extend this with a literal `kind` and their own descriptor fields — no central union here.
export interface Light extends Entity {
  kind: Kind;
}
