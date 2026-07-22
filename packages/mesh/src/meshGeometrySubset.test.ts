import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import {
  addMeshGeometrySubset,
  getMeshGeometrySubsetTriangleCount,
  getMeshGeometryTriangleSubsetIndex,
  setMeshGeometrySubsets,
} from './meshGeometrySubset';

const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// A two-triangle quad so the default subset spans 6 indices.
function makeQuad() {
  const vertices = new Float32Array(4 * 12);
  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
  return createMeshGeometry({ indices: indices, layout: CANONICAL_LAYOUT, vertices: vertices });
}

describe('addMeshGeometrySubset', () => {
  it('appends a subset, replacing the array reference', () => {
    const geometry = makeQuad();
    const previous = geometry.subsets;
    addMeshGeometrySubset(geometry, { indexCount: 3, indexOffset: 3 });
    expect(geometry.subsets.length).toBe(2);
    expect(geometry.subsets[1].indexOffset).toBe(3);
    expect(geometry.subsets).not.toBe(previous);
  });
});

describe('getMeshGeometrySubsetTriangleCount', () => {
  it('divides the index count by three for triangle-list topology', () => {
    const geometry = makeQuad();
    expect(getMeshGeometrySubsetTriangleCount(geometry, 0)).toBe(2);
  });

  it('returns the sentinel 0 for an out-of-range subset', () => {
    const geometry = makeQuad();
    expect(getMeshGeometrySubsetTriangleCount(geometry, 5)).toBe(0);
    expect(getMeshGeometrySubsetTriangleCount(geometry, -1)).toBe(0);
  });

  it('counts strip triangles as indexCount - 2', () => {
    const vertices = new Float32Array(4 * 12);
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 3]),
      layout: CANONICAL_LAYOUT,
      topology: 'triangle-strip',
      vertices: vertices,
    });
    expect(getMeshGeometrySubsetTriangleCount(geometry, 0)).toBe(2);
  });
});

describe('getMeshGeometryTriangleSubsetIndex', () => {
  it('resolves list triangles against element ranges', () => {
    const geometry = makeQuad();
    setMeshGeometrySubsets(geometry, [
      { indexCount: 3, indexOffset: 0 },
      { indexCount: 3, indexOffset: 3 },
    ]);
    expect(getMeshGeometryTriangleSubsetIndex(geometry, 0)).toBe(0);
    expect(getMeshGeometryTriangleSubsetIndex(geometry, 1)).toBe(1);
    expect(getMeshGeometryTriangleSubsetIndex(geometry, 2)).toBe(-1);
  });

  it('resolves overlapping strip triangles and rejects non-triangle topology', () => {
    const geometry = makeQuad();
    geometry.topology = 'triangle-strip';
    geometry.indices = new Uint16Array([0, 1, 2, 3]);
    setMeshGeometrySubsets(geometry, [{ indexCount: 4, indexOffset: 0 }]);
    expect(getMeshGeometryTriangleSubsetIndex(geometry, 0)).toBe(0);
    expect(getMeshGeometryTriangleSubsetIndex(geometry, 1)).toBe(0);
    geometry.topology = 'line-list';
    expect(getMeshGeometryTriangleSubsetIndex(geometry, 0)).toBe(-1);
  });
});

describe('setMeshGeometrySubsets', () => {
  it('replaces the entire subset list with a fresh copy', () => {
    const geometry = makeQuad();
    const input = [
      { indexCount: 3, indexOffset: 0 },
      { indexCount: 3, indexOffset: 3 },
    ];
    setMeshGeometrySubsets(geometry, input);
    expect(geometry.subsets.length).toBe(2);
    // Copied, not aliased to the input objects.
    expect(geometry.subsets[0]).not.toBe(input[0]);
    expect(geometry.subsets[1].indexOffset).toBe(3);
  });
});
