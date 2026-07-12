// A baked 3D color lookup table: the LUT-tier fuse artifact. A stack of pointwise adjustments whose
// composition is not a pure affine matrix (gamma, hue/saturation, posterize, a supplied grade LUT)
// bakes into ONE ColorLut — `size³` RGB cells sampling the composed rgb→rgb function on the unit cube —
// and folds into the draw as a single trilinear texture tap instead of one pass per op. `samples` holds
// `size³ · 3` values in `[0, 1]`, R fastest then G then B: cell (ri, gi, bi) starts at
// `((bi · size + gi) · size + ri) · 3`. Larger `size` reduces banding at a memory/upload cost (default 32).
export interface ColorLut {
  size: number;
  samples: readonly number[];
}
