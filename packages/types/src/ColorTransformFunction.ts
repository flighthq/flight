// A pointwise rgb→rgb value remap on normalized `[0, 1]` color, the LUT-tier's composable unit. Reads
// (r, g, b) and writes the remapped color into `out` (length-3, R/G/B). Alpha is not an input — the LUT
// is a 3D rgb cube — so a transform that needs alpha belongs in the Effect tier, not here. A stack of
// these composes by function composition and bakes into one ColorLut (bakeColorLut); a matrix-tier
// adjustment contributes one of these too (its 4×5 matrix evaluated at opaque alpha), so a mixed run
// still bakes into a single LUT.
export type ColorTransformFunction = (out: [number, number, number], r: number, g: number, b: number) => void;
