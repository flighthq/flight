import type { MeshGeometry, VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';

// Re-packs a geometry's interleaved vertex stream into a new layout. Attributes present in both
// the source layout and `targetLayout` are copied by semantic into the corresponding slot of the
// new stream. Attributes in `targetLayout` that are absent in the source are zero-filled.
// Attributes in the source that are absent in `targetLayout` are silently dropped. Matching formats
// copy their attribute bytes exactly; differing declared formats convert component values, including
// normalized packed channels. Components absent from the source remain zero.
//
// Returns a new MeshGeometry with equivalent index data, topology, and subsets as `source`. The
// `version` field resets to 0. Bounds are set to `null` (caller should recompute if needed). The
// source geometry is not modified.
export function convertMeshGeometryLayout(
  source: Readonly<MeshGeometry>,
  targetLayout: Readonly<VertexAttributeLayout>,
): MeshGeometry {
  const srcStride = source.layout.stride;
  const dstStride = targetLayout.stride;
  const vertexCount = srcStride > 0 ? Math.floor(source.vertices.byteLength / srcStride) : 0;
  const dstVertices = new Float32Array((vertexCount * dstStride) / 4);
  const sourceBytes = new Uint8Array(source.vertices.buffer, source.vertices.byteOffset, source.vertices.byteLength);
  const destinationBytes = new Uint8Array(dstVertices.buffer);
  const sourceView = new DataView(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength);
  const destinationView = new DataView(destinationBytes.buffer);

  const mappings: AttributeMapping[] = [];
  for (const dstAttr of targetLayout.attributes) {
    const srcAttr = source.layout.attributes.find((attribute) => attribute.semantic === dstAttr.semantic);
    if (!srcAttr) continue;
    const sourceByteLength = getVertexFormatByteLength(srcAttr.format);
    const destinationByteLength = getVertexFormatByteLength(dstAttr.format);
    if (
      sourceByteLength === 0 ||
      destinationByteLength === 0 ||
      srcAttr.byteOffset < 0 ||
      dstAttr.byteOffset < 0 ||
      srcAttr.byteOffset + sourceByteLength > srcStride ||
      dstAttr.byteOffset + destinationByteLength > dstStride
    ) {
      continue;
    }
    mappings.push({ destination: dstAttr, source: srcAttr, sourceByteLength });
  }

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    for (const mapping of mappings) {
      const sourceOffset = vertex * srcStride + mapping.source.byteOffset;
      const destinationOffset = vertex * dstStride + mapping.destination.byteOffset;
      if (mapping.source.format === mapping.destination.format) {
        destinationBytes.set(
          sourceBytes.subarray(sourceOffset, sourceOffset + mapping.sourceByteLength),
          destinationOffset,
        );
        continue;
      }
      const componentCount = Math.min(
        getVertexFormatComponentCount(mapping.source.format),
        getVertexFormatComponentCount(mapping.destination.format),
      );
      for (let component = 0; component < componentCount; component++) {
        writeVertexFormatComponent(
          destinationView,
          destinationOffset,
          mapping.destination.format,
          component,
          readVertexFormatComponent(sourceView, sourceOffset, mapping.source.format, component),
        );
      }
    }
  }

  return createMeshGeometry({
    indices: source.indices ?? undefined,
    layout: targetLayout,
    subsets: source.subsets,
    topology: source.topology,
    vertices: dstVertices,
  });
}

interface AttributeMapping {
  destination: VertexAttributeLayout['attributes'][number];
  source: VertexAttributeLayout['attributes'][number];
  sourceByteLength: number;
}

function getVertexFormatByteLength(format: VertexAttributeLayout['attributes'][number]['format']): number {
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

function getVertexFormatComponentCount(format: VertexAttributeLayout['attributes'][number]['format']): number {
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

function readVertexFormatComponent(
  view: Readonly<DataView>,
  byteOffset: number,
  format: VertexAttributeLayout['attributes'][number]['format'],
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
      return view.getUint8(byteOffset + component) / 0xff;
  }
}

function writeVertexFormatComponent(
  view: DataView,
  byteOffset: number,
  format: VertexAttributeLayout['attributes'][number]['format'],
  component: number,
  value: number,
): void {
  switch (format) {
    case 'float32x2':
    case 'float32x3':
    case 'float32x4':
      view.setFloat32(byteOffset + component * 4, value, true);
      return;
    case 'uint16x4':
      view.setUint16(byteOffset + component * 2, Math.round(Math.min(0xffff, Math.max(0, value))), true);
      return;
    case 'uint8x4':
      view.setUint8(byteOffset + component, Math.round(Math.min(0xff, Math.max(0, value))));
      return;
    case 'unorm8x4':
      view.setUint8(byteOffset + component, Math.round(Math.min(1, Math.max(0, value)) * 0xff));
  }
}

// The canonical interleaved PBR vertex layout used by every built-in primitive builder:
//   position(3) + normal(3) + tangent(4, w = glTF handedness) + uv0(2) = 12 floats / 48 bytes.
// Pass this constant to `createMeshGeometryFromAttributes` or `createMeshGeometry` when building
// geometry that should match the layout of the built-in primitives.
export const CANONICAL_MESH_GEOMETRY_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// The canonical interleaved skinned-mesh layout: the PBR record above extended past uv0 with the
// two 4-influence skinning channels — joints0 (the 4 influencing joint indices) and weights0 (their
// blend weights) — for 20 floats / 80 bytes. Both are float32x4 so the whole record stays in one
// Float32Array (geometry.vertices), the format CPU skinning reads directly and GPU skinning uploads
// as float attributes at locations 6–7; the packed uint8x4/unorm8x4 formats remain available for a
// later compaction pass but are not required. position/normal keep offsets 0/12, so normal/bounds
// compute and the rigid draw path work unchanged — a skinned geometry differs only by carrying the
// extra channels a skin reads. Pass to createMeshGeometry when building geometry a Skin will deform.
export const CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
    { byteOffset: 48, format: 'float32x4', semantic: 'joints0' },
    { byteOffset: 64, format: 'float32x4', semantic: 'weights0' },
  ],
  stride: 80,
};
