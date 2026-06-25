import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import { computeMeshGeometryWireframeIndices, expandMeshGeometryIndices } from './meshGeometryIndex';

const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// A quad: 4 vertices, 2 triangles sharing the (1, 2) edge, position packed into slot 0.
function makeQuad() {
  const vertices = new Float32Array(4 * 12);
  const setPosition = (i: number, x: number, y: number): void => {
    vertices[i * 12] = x;
    vertices[i * 12 + 1] = y;
  };
  setPosition(0, 0, 0);
  setPosition(1, 1, 0);
  setPosition(2, 0, 1);
  setPosition(3, 1, 1);
  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
  return createMeshGeometry({ indices: indices, layout: CANONICAL_LAYOUT, vertices: vertices });
}

describe('computeMeshGeometryWireframeIndices', () => {
  it('expands each triangle into three edge line segments', () => {
    const geometry = makeQuad();
    const lines = computeMeshGeometryWireframeIndices(geometry);
    // 2 triangles * 3 edges * 2 indices.
    expect(lines.length).toBe(12);
    expect(Array.from(lines.slice(0, 6))).toEqual([0, 1, 1, 2, 2, 0]);
  });

  it('mirrors the source index width (Uint16 stays Uint16)', () => {
    const geometry = makeQuad();
    const lines = computeMeshGeometryWireframeIndices(geometry);
    expect(lines).toBeInstanceOf(Uint16Array);
  });

  it('returns an empty buffer for non-triangle topology', () => {
    const vertices = new Float32Array(2 * 12);
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1]),
      layout: CANONICAL_LAYOUT,
      topology: 'line-list',
      vertices: vertices,
    });
    const lines = computeMeshGeometryWireframeIndices(geometry);
    expect(lines.length).toBe(0);
  });
});

describe('expandMeshGeometryIndices', () => {
  it('un-welds shared vertices into per-index copies', () => {
    const geometry = makeQuad();
    const expanded = expandMeshGeometryIndices(geometry);
    expect(expanded.indices).toBeNull();
    // 6 indices -> 6 standalone vertices.
    expect(expanded.vertices.length).toBe(6 * 12);
    // Index 2 (position 0,1) appears at flat positions 2 and 3.
    expect(expanded.vertices[2 * 12]).toBe(0);
    expect(expanded.vertices[2 * 12 + 1]).toBe(1);
    expect(expanded.vertices[3 * 12]).toBe(0);
    expect(expanded.vertices[3 * 12 + 1]).toBe(1);
  });

  it('deep-copies non-indexed geometry as-is', () => {
    const vertices = new Float32Array(3 * 12);
    vertices[0] = 7;
    const geometry = createMeshGeometry({ indices: null, layout: CANONICAL_LAYOUT, vertices: vertices });
    const expanded = expandMeshGeometryIndices(geometry);
    expect(expanded.indices).toBeNull();
    expect(expanded.vertices.length).toBe(3 * 12);
    expect(expanded.vertices[0]).toBe(7);
    // Distinct backing array.
    expect(expanded.vertices).not.toBe(geometry.vertices);
  });
});
