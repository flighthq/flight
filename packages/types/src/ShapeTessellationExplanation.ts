export type ShapeTessellationStatus = 'tessellates' | 'needs-rasterizer';

export type ShapeTessellationBlocker =
  | 'none'
  // A gradient fill, a texture fill, or a textured drawTriangles: paint the mesh lane has no shader for.
  | 'non-solid-fill'
  // A gradient or texture line style, for the same reason.
  | 'non-solid-stroke'
  // A stroke the active lane cannot turn into fillable outlines — a closed ring in the default lane,
  // which the opt-in stroke-path tessellator does express.
  | 'stroke-outline';

/**
 * Describes whether a command stream can be drawn as GPU mesh regions, and what stops it when it
 * cannot. This is the query twin of the null `getShapeFillRegions` / `getShapeStrokeOutlineRegions`
 * return: those report only that the mesh lane declined, which leaves a shape that draws nothing —
 * because no rasterizer is registered to take over — with nothing to inspect.
 *
 * `needs-rasterizer` is a statement about the lane, not a defect: a backend with a shape rasterizer
 * registered draws the shape correctly, just through a raster rather than as geometry.
 */
export interface ShapeTessellationExplanation {
  readonly blockedBy: ShapeTessellationBlocker;
  readonly status: ShapeTessellationStatus;
}
