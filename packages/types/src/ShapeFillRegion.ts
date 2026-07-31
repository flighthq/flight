import type { Path } from './Path';

// One solid-color filled region resolved from a Shape's drawing commands: the fill outline as a `Path`
// (curves intact, flattened/tessellated by the renderer) plus its packed color and alpha. Produced by
// `getShapeFillRegions` for the GPU shape-fill path; gradient/texture fills are not expressed here.
// Stroke regions use the same representation and are produced independently by `getShapeStrokeRegions`.
export interface ShapeFillRegion {
  path: Path;
  color: number;
  alpha: number;
}
