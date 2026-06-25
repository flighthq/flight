import type { MeshGeometry, VertexAttribute, VertexAttributeLayout, VertexSemantic } from '@flighthq/types';

// Attribute introspection and typed per-vertex read/write accessors for interleaved mesh geometry.
// Every accessor resolves float offsets through getVertexAttributeFloatOffset, so they work on any
// layout — not just the canonical PBR record. set* functions bump geometry.version so backends
// know to re-upload.

// Reads the position (x, y, z) of vertex `vertexIndex` into `out`. Returns false when the
// layout has no position semantic or vertexIndex is out of range; out is unchanged.
export function getMeshGeometryVertexNormal(
  out: { x: number; y: number; z: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
): boolean {
  return getFloat3Attribute(out, geometry, vertexIndex, 'normal');
}

// Reads the position (x, y, z) of vertex `vertexIndex` into `out`. Returns false when the
// layout has no position semantic or vertexIndex is out of range; out is unchanged.
export function getMeshGeometryVertexPosition(
  out: { x: number; y: number; z: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
): boolean {
  return getFloat3Attribute(out, geometry, vertexIndex, 'position');
}

// Reads the tangent (x, y, z, w) of vertex `vertexIndex` into `out`. Returns false when the
// layout has no tangent semantic or vertexIndex is out of range; out is unchanged.
export function getMeshGeometryVertexTangent(
  out: { w: number; x: number; y: number; z: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
): boolean {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, 'tangent');
  if (floatOffset < 0) return false;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  if (vertexIndex < 0 || vertexIndex >= vertexCount) return false;
  const base = vertexIndex * floatsPerVertex + floatOffset;
  out.x = geometry.vertices[base];
  out.y = geometry.vertices[base + 1];
  out.z = geometry.vertices[base + 2];
  out.w = geometry.vertices[base + 3];
  return true;
}

// Reads the uv0 (u, v) of vertex `vertexIndex` into `out`. Returns false when the layout has
// no uv0 semantic or vertexIndex is out of range; out is unchanged.
export function getMeshGeometryVertexUv0(
  out: { x: number; y: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
): boolean {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
  if (floatOffset < 0) return false;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  if (vertexIndex < 0 || vertexIndex >= vertexCount) return false;
  const base = vertexIndex * floatsPerVertex + floatOffset;
  out.x = geometry.vertices[base];
  out.y = geometry.vertices[base + 1];
  return true;
}

// Returns the VertexAttribute for the given semantic from the layout, or null if absent.
export function getVertexAttribute(
  layout: Readonly<VertexAttributeLayout>,
  semantic: VertexSemantic,
): VertexAttribute | null {
  const attrs = layout.attributes;
  for (let i = 0; i < attrs.length; i++) {
    if (attrs[i].semantic === semantic) return attrs[i];
  }
  return null;
}

// Returns the float index (byteOffset / 4) within one vertex record for the given semantic, or
// -1 when the semantic is absent from the layout or has a non-float format. Only float32*
// formats (which are 4-byte aligned) are supported by the typed accessors.
export function getVertexAttributeFloatOffset(
  layout: Readonly<VertexAttributeLayout>,
  semantic: VertexSemantic,
): number {
  const attrs = layout.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (attr.semantic === semantic) {
      if (!attr.format.startsWith('float32')) return -1;
      return attr.byteOffset / 4;
    }
  }
  return -1;
}

// Writes the normal (x, y, z) for vertex `vertexIndex`. Bumps geometry.version. Returns false
// when the layout has no normal semantic or vertexIndex is out of range; geometry is unchanged.
export function setMeshGeometryVertexNormal(
  geometry: MeshGeometry,
  vertexIndex: number,
  x: number,
  y: number,
  z: number,
): boolean {
  return setFloat3Attribute(geometry, vertexIndex, 'normal', x, y, z);
}

// Writes the position (x, y, z) for vertex `vertexIndex`. Bumps geometry.version. Returns false
// when the layout has no position semantic or vertexIndex is out of range; geometry is unchanged.
export function setMeshGeometryVertexPosition(
  geometry: MeshGeometry,
  vertexIndex: number,
  x: number,
  y: number,
  z: number,
): boolean {
  return setFloat3Attribute(geometry, vertexIndex, 'position', x, y, z);
}

// Writes the tangent (x, y, z, w) for vertex `vertexIndex`. Bumps geometry.version. Returns
// false when the layout has no tangent semantic or vertexIndex is out of range.
export function setMeshGeometryVertexTangent(
  geometry: MeshGeometry,
  vertexIndex: number,
  x: number,
  y: number,
  z: number,
  w: number,
): boolean {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, 'tangent');
  if (floatOffset < 0) return false;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  if (vertexIndex < 0 || vertexIndex >= vertexCount) return false;
  const base = vertexIndex * floatsPerVertex + floatOffset;
  geometry.vertices[base] = x;
  geometry.vertices[base + 1] = y;
  geometry.vertices[base + 2] = z;
  geometry.vertices[base + 3] = w;
  geometry.version++;
  return true;
}

// Writes the uv0 (u, v) for vertex `vertexIndex`. Bumps geometry.version. Returns false when
// the layout has no uv0 semantic or vertexIndex is out of range.
export function setMeshGeometryVertexUv0(geometry: MeshGeometry, vertexIndex: number, u: number, v: number): boolean {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
  if (floatOffset < 0) return false;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  if (vertexIndex < 0 || vertexIndex >= vertexCount) return false;
  const base = vertexIndex * floatsPerVertex + floatOffset;
  geometry.vertices[base] = u;
  geometry.vertices[base + 1] = v;
  geometry.version++;
  return true;
}

function getFloat3Attribute(
  out: { x: number; y: number; z: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
  semantic: VertexSemantic,
): boolean {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, semantic);
  if (floatOffset < 0) return false;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  if (vertexIndex < 0 || vertexIndex >= vertexCount) return false;
  const base = vertexIndex * floatsPerVertex + floatOffset;
  out.x = geometry.vertices[base];
  out.y = geometry.vertices[base + 1];
  out.z = geometry.vertices[base + 2];
  return true;
}

function setFloat3Attribute(
  geometry: MeshGeometry,
  vertexIndex: number,
  semantic: VertexSemantic,
  x: number,
  y: number,
  z: number,
): boolean {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, semantic);
  if (floatOffset < 0) return false;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  if (vertexIndex < 0 || vertexIndex >= vertexCount) return false;
  const base = vertexIndex * floatsPerVertex + floatOffset;
  geometry.vertices[base] = x;
  geometry.vertices[base + 1] = y;
  geometry.vertices[base + 2] = z;
  geometry.version++;
  return true;
}
