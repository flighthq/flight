import type { MeshGeometry, VertexAttribute, VertexAttributeLayout, VertexSemantic } from '@flighthq/types';

// Attribute introspection and typed per-vertex read/write accessors for interleaved mesh geometry.
// Every accessor resolves float offsets through getVertexAttributeFloatOffset, so they work on any
// layout — not just the canonical PBR record. set* functions bump geometry.version so backends
// know to re-upload.

// Reads the primary vertex color into `out`. Packed unorm8 values are decoded to [0, 1], while
// uint8/uint16 values remain integer-valued. A float32x3 color receives the same implicit alpha=1
// that the GL vertex-input contract supplies. Returns false without touching `out` when absent,
// malformed, or out of range.
export function getMeshGeometryVertexColor0(
  out: { w: number; x: number; y: number; z: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
): boolean {
  return getFourComponentAttribute(out, geometry, vertexIndex, 'color0', true);
}

// Reads the four primary joint indices. Supports the declared float32x4, uint8x4, and uint16x4
// encodings so CPU skinning and inspection observe the same values as a backend upload.
export function getMeshGeometryVertexJoints0(
  out: { w: number; x: number; y: number; z: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
): boolean {
  return getFourComponentAttribute(out, geometry, vertexIndex, 'joints0', false);
}

// Reads the normal (x, y, z) of vertex `vertexIndex` into `out`. Returns false when the
// layout has no normal semantic or vertexIndex is out of range; out is unchanged.
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

// Reads the secondary texture coordinate channel. This is deliberately a sibling of uv0 rather
// than a material-specific helper: which map consumes uv1 is material policy.
export function getMeshGeometryVertexUv1(
  out: { x: number; y: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
): boolean {
  return getFloat2Attribute(out, geometry, vertexIndex, 'uv1');
}

// Reads the four primary skin weights, decoding unorm8 storage when present.
export function getMeshGeometryVertexWeights0(
  out: { w: number; x: number; y: number; z: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
): boolean {
  return getFourComponentAttribute(out, geometry, vertexIndex, 'weights0', false);
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

// Writes color0 through its declared storage format. Packed writes clamp to the representable range;
// float32x3 storage intentionally ignores alpha. Bumps geometry.version exactly once on success.
export function setMeshGeometryVertexColor0(
  geometry: MeshGeometry,
  vertexIndex: number,
  r: number,
  g: number,
  b: number,
  a: number,
): boolean {
  return setFourComponentAttribute(geometry, vertexIndex, 'color0', r, g, b, a, true);
}

// Writes the four primary joint indices through float or packed unsigned storage.
export function setMeshGeometryVertexJoints0(
  geometry: MeshGeometry,
  vertexIndex: number,
  x: number,
  y: number,
  z: number,
  w: number,
): boolean {
  return setFourComponentAttribute(geometry, vertexIndex, 'joints0', x, y, z, w, false);
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

// Writes the secondary texture coordinate channel.
export function setMeshGeometryVertexUv1(geometry: MeshGeometry, vertexIndex: number, u: number, v: number): boolean {
  return setFloat2Attribute(geometry, vertexIndex, 'uv1', u, v);
}

// Writes the four primary skin weights, quantizing and clamping unorm8 storage when present.
export function setMeshGeometryVertexWeights0(
  geometry: MeshGeometry,
  vertexIndex: number,
  x: number,
  y: number,
  z: number,
  w: number,
): boolean {
  return setFourComponentAttribute(geometry, vertexIndex, 'weights0', x, y, z, w, false);
}

function getFloat2Attribute(
  out: { x: number; y: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
  semantic: VertexSemantic,
): boolean {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, semantic);
  if (floatOffset < 0) return false;
  const attribute = getVertexAttribute(geometry.layout, semantic);
  if (attribute?.format !== 'float32x2') return false;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  if (vertexIndex < 0 || vertexIndex >= vertexCount) return false;
  const base = vertexIndex * floatsPerVertex + floatOffset;
  out.x = geometry.vertices[base];
  out.y = geometry.vertices[base + 1];
  return true;
}

function getFourComponentAttribute(
  out: { w: number; x: number; y: number; z: number },
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
  semantic: VertexSemantic,
  allowFloat3: boolean,
): boolean {
  const location = getAttributeByteLocation(geometry, vertexIndex, semantic);
  if (location === null) return false;
  const { attribute, byteOffset, view } = location;
  const componentCount = getVertexFormatComponentCount(attribute.format);
  if (componentCount !== 4 && !(allowFloat3 && attribute.format === 'float32x3')) return false;
  const x = readVertexComponent(view, byteOffset, attribute.format, 0);
  const y = readVertexComponent(view, byteOffset, attribute.format, 1);
  const z = readVertexComponent(view, byteOffset, attribute.format, 2);
  const w = componentCount === 4 ? readVertexComponent(view, byteOffset, attribute.format, 3) : 1;
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
  return true;
}

function setFloat2Attribute(
  geometry: MeshGeometry,
  vertexIndex: number,
  semantic: VertexSemantic,
  x: number,
  y: number,
): boolean {
  const attribute = getVertexAttribute(geometry.layout, semantic);
  if (attribute?.format !== 'float32x2') return false;
  const location = getAttributeByteLocation(geometry, vertexIndex, semantic);
  if (location === null) return false;
  location.view.setFloat32(location.byteOffset, x, true);
  location.view.setFloat32(location.byteOffset + 4, y, true);
  geometry.version++;
  return true;
}

function setFourComponentAttribute(
  geometry: MeshGeometry,
  vertexIndex: number,
  semantic: VertexSemantic,
  x: number,
  y: number,
  z: number,
  w: number,
  allowFloat3: boolean,
): boolean {
  const location = getAttributeByteLocation(geometry, vertexIndex, semantic);
  if (location === null) return false;
  const { attribute, byteOffset, view } = location;
  const componentCount = getVertexFormatComponentCount(attribute.format);
  if (componentCount !== 4 && !(allowFloat3 && attribute.format === 'float32x3')) return false;
  writeVertexComponent(view, byteOffset, attribute.format, 0, x);
  writeVertexComponent(view, byteOffset, attribute.format, 1, y);
  writeVertexComponent(view, byteOffset, attribute.format, 2, z);
  if (componentCount === 4) writeVertexComponent(view, byteOffset, attribute.format, 3, w);
  geometry.version++;
  return true;
}

function getAttributeByteLocation(
  geometry: Readonly<MeshGeometry>,
  vertexIndex: number,
  semantic: VertexSemantic,
): { attribute: VertexAttribute; byteOffset: number; view: DataView } | null {
  const attribute = getVertexAttribute(geometry.layout, semantic);
  if (attribute === null || vertexIndex < 0 || geometry.layout.stride <= 0) return null;
  const attributeByteLength = getVertexFormatByteLength(attribute.format);
  if (attributeByteLength === 0 || attribute.byteOffset < 0) return null;
  if (attribute.byteOffset + attributeByteLength > geometry.layout.stride) return null;
  const vertexCount = Math.floor(geometry.vertices.byteLength / geometry.layout.stride);
  if (vertexIndex >= vertexCount) return null;
  const byteOffset = vertexIndex * geometry.layout.stride + attribute.byteOffset;
  if (byteOffset + attributeByteLength > geometry.vertices.byteLength) return null;
  return {
    attribute,
    byteOffset,
    view: new DataView(geometry.vertices.buffer, geometry.vertices.byteOffset, geometry.vertices.byteLength),
  };
}

function getVertexFormatByteLength(format: VertexAttribute['format']): number {
  switch (format) {
    case 'float32x2':
      return 8;
    case 'float32x3':
      return 12;
    case 'float32x4':
      return 16;
    case 'uint16x4':
      return 8;
    case 'uint8x4':
    case 'unorm8x4':
      return 4;
  }
}

function getVertexFormatComponentCount(format: VertexAttribute['format']): number {
  switch (format) {
    case 'float32x2':
      return 2;
    case 'float32x3':
      return 3;
    case 'float32x4':
    case 'uint16x4':
    case 'uint8x4':
    case 'unorm8x4':
      return 4;
  }
}

function readVertexComponent(
  view: DataView,
  byteOffset: number,
  format: VertexAttribute['format'],
  component: number,
): number {
  switch (format) {
    case 'float32x2':
    case 'float32x3':
    case 'float32x4':
      return view.getFloat32(byteOffset + component * 4, true);
    case 'uint16x4':
      return view.getUint16(byteOffset + component * 2, true);
    case 'uint8x4':
      return view.getUint8(byteOffset + component);
    case 'unorm8x4':
      return view.getUint8(byteOffset + component) / 255;
  }
}

function writeVertexComponent(
  view: DataView,
  byteOffset: number,
  format: VertexAttribute['format'],
  component: number,
  value: number,
): void {
  switch (format) {
    case 'float32x2':
    case 'float32x3':
    case 'float32x4':
      view.setFloat32(byteOffset + component * 4, value, true);
      break;
    case 'uint16x4':
      view.setUint16(byteOffset + component * 2, Math.round(clamp(value, 0, 65_535)), true);
      break;
    case 'uint8x4':
      view.setUint8(byteOffset + component, Math.round(clamp(value, 0, 255)));
      break;
    case 'unorm8x4':
      view.setUint8(byteOffset + component, Math.round(clamp(value, 0, 1) * 255));
      break;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
