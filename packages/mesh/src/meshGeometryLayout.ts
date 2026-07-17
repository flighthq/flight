import type { MeshGeometry, VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';

// Re-packs a geometry's interleaved vertex stream into a new layout. Attributes present in both
// the source layout and `targetLayout` are copied by semantic into the corresponding slot of the
// new stream. Attributes in `targetLayout` that are absent in the source are zero-filled.
// Attributes in the source that are absent in `targetLayout` are silently dropped. Only float32*
// attributes (4 bytes per component) are copied; other formats are not yet supported and are
// zero-filled in the target.
//
// Returns a new MeshGeometry with the same index buffer (by reference), topology, and subsets
// as `source`. The `version` field resets to 0. Bounds are set to `null` (caller should
// recompute if needed). The source geometry is not modified.
export function convertMeshGeometryLayout(
  source: Readonly<MeshGeometry>,
  targetLayout: Readonly<VertexAttributeLayout>,
): MeshGeometry {
  const srcStride = source.layout.stride;
  const dstStride = targetLayout.stride;
  const srcFloatsPerVertex = srcStride / 4;
  const dstFloatsPerVertex = dstStride / 4;
  const vertexCount = srcFloatsPerVertex > 0 ? Math.floor(source.vertices.length / srcFloatsPerVertex) : 0;
  const dstVertices = new Float32Array(vertexCount * dstFloatsPerVertex);
  const srcVerts = source.vertices;

  // Build a mapping from each target attribute to its source float offset.
  // Only float32* formats are handled; non-float32 target attributes stay zero.
  const mapping: { componentCount: number; dstFloatOffset: number; srcFloatOffset: number }[] = [];
  for (const dstAttr of targetLayout.attributes) {
    if (!dstAttr.format.startsWith('float32')) continue;
    const dstFloatOffset = dstAttr.byteOffset / 4;
    const componentCount = getFloat32ComponentCount(dstAttr.format);
    if (componentCount === 0) continue;
    // Find the matching source attribute by semantic.
    const srcAttr = source.layout.attributes.find(
      (a) => a.semantic === dstAttr.semantic && a.format.startsWith('float32'),
    );
    if (!srcAttr) continue;
    mapping.push({
      componentCount,
      dstFloatOffset,
      srcFloatOffset: srcAttr.byteOffset / 4,
    });
  }

  for (let i = 0; i < vertexCount; i++) {
    const srcBase = i * srcFloatsPerVertex;
    const dstBase = i * dstFloatsPerVertex;
    for (const { dstFloatOffset, srcFloatOffset, componentCount } of mapping) {
      for (let c = 0; c < componentCount; c++) {
        dstVertices[dstBase + dstFloatOffset + c] = srcVerts[srcBase + srcFloatOffset + c];
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

// Returns the number of float32 components for a float32* VertexFormat string (e.g. 'float32x3'
// → 3, 'float32' → 1). Returns 0 for unrecognized formats.
function getFloat32ComponentCount(format: string): number {
  if (format === 'float32') return 1;
  if (format === 'float32x2') return 2;
  if (format === 'float32x3') return 3;
  if (format === 'float32x4') return 4;
  return 0;
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
