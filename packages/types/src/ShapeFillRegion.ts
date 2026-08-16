import type { Path } from './Path';

// One solid-color filled region resolved from a Shape's drawing commands: the fill outline as a `Path`
// (curves intact, flattened/tessellated by the renderer) plus its packed color and alpha. Produced by
// `getShapeFillRegions` for the GPU shape-fill path; gradient/texture fills are not expressed here.
export interface ShapeFillRegion {
  path: Path;
  // Packed RGBA (`0xRRGGBBAA`). The alpha channel is the color's own opacity; the separate `alpha`
  // field is an additional fill-level opacity multiplier. Final rendered alpha = colorAlpha * alpha.
  color: number;
  alpha: number;
}
