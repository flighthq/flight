// Identifies which geometry accumulation pipeline a renderer submits into. This is the first
// component of the flush key: (BatchFormat, texture, blend, material). Consecutive draws that
// share the same key coalesce in the open batch; a key change or a BatchBarrier forces a flush.
//
// Quad:         Instanced textured-quad path. One instance = implicit four-vertex quad with
//               per-instance transform, UV rect, and alpha. Used by sprites, bitmaps, glyphs,
//               video frames — anything that maps a rectangular region of a texture onto a quad.
//
// VertexStream: Explicit vertex + index buffer path. Geometry arrives as a vertex/index stream
//               rather than as quad instances. Used by shapes, gradients, and scale-9 geometry.
//               Named VertexStream rather than Mesh to avoid collision with 3D mesh assets when
//               the world package gains real 3D geometry.
export enum BatchFormat {
  Quad,
  VertexStream,
}
