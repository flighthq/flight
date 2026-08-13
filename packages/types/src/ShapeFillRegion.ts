import type { Path } from './Path';

// One solid-color filled region resolved from a Shape's drawing commands: the fill outline as a `Path`
// (curves intact, flattened/tessellated by the renderer) plus its packed color and alpha. Produced by
// `getShapeFillRegions` for the GPU shape-fill path; gradient/texture fills are not expressed here.
export interface ShapeFillRegion {
  path: Path;
  // 24-bit RGB (`0xRRGGBB`) — opacity is the separate `alpha` on the fill, not a fourth channel.
  // This is the shape authoring convention, NOT the packed RGBA most SDK colors carry.
  color: number;
  alpha: number;
}
