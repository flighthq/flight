// One tessellated solid-fill region of a Shape, ready for the WebGL flat-color mesh path: interleaved
// xy `vertices`, triangle `indices`, a packed 0xRRGGBB fill `color`, and the region `alpha`. Produced
// on the CPU (cached by content revision) and drawn crisp at any zoom, the resolution-independent
// alternative to the canvas-raster-to-texture shortcut. Shared across displayobject-gl's base mesh
// path and the opt-in color-adjustment fold, so it lives in the header layer both reach.
export interface GlShapeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  color: number;
  alpha: number;
}
