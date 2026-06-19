/**
 * A triangulated fill produced from a `Path`: a flat vertex buffer (x, y pairs) and triangle indices
 * (three per triangle) into it. This is the direct-fill route — draw the mesh as triangles (MSAA for
 * edges), no stencil. The parallel route is `flattenPath` + GPU stencil-then-cover, which handles
 * holes and self-intersection that the CPU triangulator does not. Plain data for clean C/GPU upload.
 */
export interface PathMesh {
  vertices: number[];
  indices: number[];
}
