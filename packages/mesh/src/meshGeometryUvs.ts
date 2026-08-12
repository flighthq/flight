import type { MeshGeometry } from '@flighthq/types/contract';

import { getVertexAttributeFloatOffset } from './meshGeometryAttributes';

// UV transform helpers for the uv0 channel. All functions write directly into geometry.vertices
// and bump geometry.version. They operate on whatever attribute is registered under the 'uv0'
// semantic in the geometry's layout — so they work on canonical-layout geometry and any custom
// layout that includes uv0. No-ops (with no version bump) when uv0 is absent from the layout.

// Offsets every uv0 coordinate by (du, dv): u' = u + du, v' = v + dv. Useful for texture atlas
// panning or tiling offset corrections.
export function offsetMeshGeometryUvs(geometry: MeshGeometry, du: number, dv: number): void {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
  if (floatOffset < 0) return;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  const verts = geometry.vertices;
  for (let i = 0; i < vertexCount; i++) {
    const base = i * floatsPerVertex + floatOffset;
    verts[base] += du;
    verts[base + 1] += dv;
  }
  if (vertexCount > 0) geometry.version++;
}

// Scales every uv0 coordinate by (su, sv) around the origin: u' = u * su, v' = v * sv. Useful
// for tiling — e.g. scaleMeshGeometryUvs(geo, 2, 2) tiles the texture 2× in each direction.
//
// ★ A NEGATIVE SCALE MIRRORS THE SAMPLING BUT NOT THE STORED TANGENT FRAME. Tangents are derived
// from the UV gradient, so mirroring u or v reverses the direction a tangent should point and the
// handedness that goes with it, while the tangent records already in the vertex stream keep their
// old values. Any normal-mapped material then reconstructs its bitangent from a frame that no
// longer matches the coordinates it samples, which reads as lighting flipped across the mirrored
// axis. The remedy is the caller's: run `computeMeshGeometryTangents` afterwards to re-derive the
// frame from the new coordinates. This operation deliberately does NOT do that for you — a UV edit
// that silently rewrote the tangent attribute would be exactly the hidden side effect this codebase
// rules out, and callers that only ever scale positively should not pay for a recompute.
export function scaleMeshGeometryUvs(geometry: MeshGeometry, su: number, sv: number): void {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
  if (floatOffset < 0) return;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  const verts = geometry.vertices;
  for (let i = 0; i < vertexCount; i++) {
    const base = i * floatsPerVertex + floatOffset;
    verts[base] *= su;
    verts[base + 1] *= sv;
  }
  if (vertexCount > 0) geometry.version++;
}

// Wraps every uv0 coordinate into [0, 1) using the fractional-part operation: u' = u - floor(u).
// Useful after scale or offset operations that push coordinates outside the 0..1 atlas tile.
// Coordinates that are exactly on integer boundaries (e.g. u = 1.0) wrap to 0.0.
export function wrapMeshGeometryUvs(geometry: MeshGeometry): void {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
  if (floatOffset < 0) return;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  const verts = geometry.vertices;
  for (let i = 0; i < vertexCount; i++) {
    const base = i * floatsPerVertex + floatOffset;
    verts[base] = verts[base] - Math.floor(verts[base]);
    verts[base + 1] = verts[base + 1] - Math.floor(verts[base + 1]);
  }
  if (vertexCount > 0) geometry.version++;
}
