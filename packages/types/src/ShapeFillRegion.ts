import type { Path } from './Path';

// One solid-color filled region resolved from a Shape's drawing commands: the fill outline as a `Path`
// (curves intact, flattened/tessellated by the renderer) plus its packed color and alpha. Produced by
// `getShapeFillRegions` for the GPU shape-fill path; gradient/bitmap fills and strokes are not expressed
// here (a shape that uses them falls back to the raster path).
export interface ShapeFillRegion {
  path: Path;
  color: number;
  alpha: number;
}
