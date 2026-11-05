export interface WgpuShapeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  // Packed RGBA (`0xRRGGBBAA`), carried straight from the shape fill region it was tessellated from.
  color: number;
  alpha: number;
}
