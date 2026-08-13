export interface WgpuShapeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  // 24-bit RGB (`0xRRGGBB`), carried straight from the shape fill region it was tessellated from.
  color: number;
  alpha: number;
}
