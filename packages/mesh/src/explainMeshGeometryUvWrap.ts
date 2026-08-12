import type { MeshGeometry, MeshGeometryUvWrap, PrimitiveTopology } from '@flighthq/types/contract';

import { getVertexAttributeFloatOffset } from './meshGeometryAttributes';

/**
 * Whether folding this geometry's uv0 channel into [0, 1) would tear any of its primitives, as plain data.
 * Pure: it reads the geometry, retains nothing, mutates nothing, and never throws.
 *
 * The test is per primitive and it is the operation's own arithmetic, not an approximation of it: a
 * primitive survives the fold exactly when `Math.floor` returns the same tile for every one of its corners,
 * which is the same `Math.floor` `wrapMeshGeometryUvs` applies. No epsilon, deliberately — an epsilon would
 * let the query and the operation disagree about a coordinate sitting on a boundary, and the query would be
 * describing an operation nobody runs.
 *
 * Malformed geometry — a non-finite uv, an index past the end of the vertex buffer — reports as torn,
 * because the comparison against NaN can never hold. That is not the useful description of what is wrong
 * with it; `validateMeshGeometry` is the query that names the actual defect.
 *
 * Primitives are counted over the whole index buffer rather than per subset, matching
 * `getMeshGeometryTriangleCount`, so the two agree on what a primitive is.
 */
export function explainMeshGeometryUvWrap(geometry: Readonly<MeshGeometry>): MeshGeometryUvWrap {
  const floatOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
  const floatsPerVertex = geometry.layout.stride / 4;
  if (floatOffset < 0 || floatsPerVertex <= 0) return untornWrap(0);

  const vertexCount = Math.floor(geometry.vertices.length / floatsPerVertex);
  const indices = geometry.indices;
  const elementCount = indices === null ? vertexCount : indices.length;
  const corners = primitiveCorners(geometry.topology);
  const advance = primitiveAdvance(geometry.topology);

  // A point has one corner, so it has nothing to straddle: every point-list primitive survives the fold.
  if (corners < 2) return untornWrap(elementCount);

  const verts = geometry.vertices;
  let firstTornPrimitive = -1;
  let primitiveCount = 0;
  let tearsU = false;
  let tearsV = false;
  let tornPrimitiveCount = 0;

  for (let start = 0; start + corners <= elementCount; start += advance) {
    const first = indices === null ? start : indices[start];
    const firstBase = first * floatsPerVertex + floatOffset;
    const tileU = Math.floor(verts[firstBase]);
    const tileV = Math.floor(verts[firstBase + 1]);
    let tornInU = false;
    let tornInV = false;
    for (let corner = 1; corner < corners; corner++) {
      const vertex = indices === null ? start + corner : indices[start + corner];
      const base = vertex * floatsPerVertex + floatOffset;
      if (Math.floor(verts[base]) !== tileU) tornInU = true;
      if (Math.floor(verts[base + 1]) !== tileV) tornInV = true;
    }
    primitiveCount++;
    if (!tornInU && !tornInV) continue;
    if (firstTornPrimitive < 0) firstTornPrimitive = primitiveCount - 1;
    tornPrimitiveCount++;
    tearsU = tearsU || tornInU;
    tearsV = tearsV || tornInV;
  }

  return { firstTornPrimitive, primitiveCount, tearsU, tearsV, tornPrimitiveCount };
}

// How far the window moves between primitives: a strip shares its trailing corners, a list does not.
function primitiveAdvance(topology: PrimitiveTopology): number {
  switch (topology) {
    case 'line-list':
      return 2;
    case 'triangle-list':
      return 3;
    case 'line-strip':
    case 'point-list':
    case 'triangle-strip':
      return 1;
  }
}

// How many vertices one primitive spans under `topology`.
function primitiveCorners(topology: PrimitiveTopology): number {
  switch (topology) {
    case 'point-list':
      return 1;
    case 'line-list':
    case 'line-strip':
      return 2;
    case 'triangle-list':
    case 'triangle-strip':
      return 3;
  }
}

function untornWrap(primitiveCount: number): MeshGeometryUvWrap {
  return { firstTornPrimitive: -1, primitiveCount, tearsU: false, tearsV: false, tornPrimitiveCount: 0 };
}
