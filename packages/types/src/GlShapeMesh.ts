// One tessellated solid-fill region of a Shape, ready for the WebGL flat-color mesh path: interleaved
// xy `vertices`, triangle `indices`, a packed 0xRRGGBB fill `color`, and the region `alpha`. Produced
// on the CPU (cached by content revision) and drawn crisp at any zoom, the resolution-independent
// alternative to the canvas-raster-to-texture shortcut. Shared across scene2d-gl's base mesh
// path and the opt-in color-adjustment fold, so it lives in the header layer both reach.
export interface GlShapeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  // 24-bit RGB (`0xRRGGBB`), carried straight from the shape fill region it was tessellated from.
  color: number;
  alpha: number;
}
