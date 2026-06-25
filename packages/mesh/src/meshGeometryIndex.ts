import type { MeshGeometry } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';

// Index-buffer pipeline over a MeshGeometry: de-index a welded stream to a flat non-indexed one,
// and derive a wireframe line-list from a triangle index buffer. These read the existing
// vertex/index streams and produce fresh data; they do not mutate the source geometry.

// Returns the wireframe line-list index buffer for the geometry's triangle indices: every triangle
// edge expands to a two-index line segment, so a triangle (a, b, c) yields the lines (a, b),
// (b, c), (c, a). Reads the existing index stream (or sequential triangles for non-indexed
// geometry) and assembles a new index buffer suitable for `line-list` topology. Returns an empty
// buffer for geometry whose topology is not a triangle family. The element type matches the source
// index width (Uint32 for non-indexed, mirroring the source buffer otherwise).
export function computeMeshGeometryWireframeIndices(
  geometry: Readonly<MeshGeometry>,
): Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> {
  const useUint32 = geometry.indices ? geometry.indices instanceof Uint32Array : true;
  if (geometry.topology !== 'triangle-list' && geometry.topology !== 'triangle-strip') {
    return useUint32 ? new Uint32Array(0) : new Uint16Array(0);
  }

  const indices = geometry.indices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  const indexCount = indices ? indices.length : vertexCount;

  const lines: number[] = [];
  if (geometry.topology === 'triangle-list') {
    for (let t = 0; t + 2 < indexCount; t += 3) {
      const a = indices ? indices[t] : t;
      const b = indices ? indices[t + 1] : t + 1;
      const c = indices ? indices[t + 2] : t + 2;
      lines.push(a, b, b, c, c, a);
    }
  } else {
    for (let t = 0; t + 2 < indexCount; t++) {
      const a = indices ? indices[t] : t;
      const b = indices ? indices[t + 1] : t + 1;
      const c = indices ? indices[t + 2] : t + 2;
      lines.push(a, b, b, c, c, a);
    }
  }

  if (useUint32) {
    const out = new Uint32Array(lines.length);
    out.set(lines);
    return out;
  }
  const out = new Uint16Array(lines.length);
  out.set(lines);
  return out;
}

// De-indexes (un-welds) the geometry into a flat non-indexed stream: each triangle index expands
// into its own copy of the referenced vertex record, so shared vertices become distinct. The
// result is a new MeshGeometry with the same layout and topology, `indices` null, and a single
// whole-range subset. This is the prerequisite for truly per-face attributes (flat shading,
// per-face UVs) where shared vertices must not be welded. Non-indexed geometry is deep-copied as-is.
export function expandMeshGeometryIndices(geometry: Readonly<MeshGeometry>): MeshGeometry {
  const indices = geometry.indices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const sourceVertices = geometry.vertices;

  if (!indices) {
    const vertices = new Float32Array(sourceVertices.length);
    vertices.set(sourceVertices);
    return createMeshGeometry({ indices: null, layout: geometry.layout, topology: geometry.topology, vertices });
  }

  const vertices = new Float32Array(indices.length * floatsPerVertex);
  for (let i = 0; i < indices.length; i++) {
    const src = indices[i] * floatsPerVertex;
    const dst = i * floatsPerVertex;
    for (let f = 0; f < floatsPerVertex; f++) {
      vertices[dst + f] = sourceVertices[src + f];
    }
  }

  return createMeshGeometry({ indices: null, layout: geometry.layout, topology: geometry.topology, vertices });
}
