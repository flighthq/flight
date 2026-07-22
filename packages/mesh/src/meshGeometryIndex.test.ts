import { createAabb } from '@flighthq/geometry';
import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import {
  computeMeshGeometryWireframeIndices,
  expandMeshGeometryIndices,
  indexMeshGeometryVertices,
  weldMeshGeometryVertices,
} from './meshGeometryIndex';

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
    geometry.bounds = createAabb(0, 0, 0, 1, 1, 0);
    geometry.subsets = [
      { indexCount: 3, indexOffset: 0 },
      { indexCount: 3, indexOffset: 3 },
    ];
    const expanded = expandMeshGeometryIndices(geometry);
    expect(expanded.indices).toBeNull();
    // 6 indices -> 6 standalone vertices.
    expect(expanded.vertices.length).toBe(6 * 12);
    // Index 2 (position 0,1) appears at flat positions 2 and 3.
    expect(expanded.vertices[2 * 12]).toBe(0);
    expect(expanded.vertices[2 * 12 + 1]).toBe(1);
    expect(expanded.vertices[3 * 12]).toBe(0);
    expect(expanded.vertices[3 * 12 + 1]).toBe(1);
    expect(expanded.subsets).toEqual(geometry.subsets);
    expect(expanded.subsets).not.toBe(geometry.subsets);
    expect(expanded.bounds?.min).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(expanded.bounds?.max).toMatchObject({ x: 1, y: 1, z: 0 });
    expect(expanded.bounds).not.toBe(geometry.bounds);
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

describe('indexMeshGeometryVertices', () => {
  it('adds a sequential narrow index without changing vertex identity or draw shape', () => {
    const geometry = createMeshGeometry({
      layout: CANONICAL_LAYOUT,
      subsets: [
        { indexCount: 3, indexOffset: 0 },
        { indexCount: 3, indexOffset: 3 },
      ],
      vertices: new Float32Array(6 * 12),
    });

    const indexed = indexMeshGeometryVertices(geometry);

    expect(indexed).not.toBe(geometry);
    expect(indexed.vertices).not.toBe(geometry.vertices);
    expect(indexed.indices).toBeInstanceOf(Uint16Array);
    expect(Array.from(indexed.indices!)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(indexed.subsets).toEqual(geometry.subsets);
    expect(indexed.subsets).not.toBe(geometry.subsets);
  });

  it('deep-clones an already indexed geometry without remapping', () => {
    const geometry = makeQuad();
    const indexed = indexMeshGeometryVertices(geometry);
    expect(indexed.indices).not.toBe(geometry.indices);
    expect(Array.from(indexed.indices!)).toEqual(Array.from(geometry.indices!));
  });
});

describe('weldMeshGeometryVertices', () => {
  it('deduplicates exact records and remaps a sequential element stream', () => {
    const vertices = new Float32Array(4 * 12);
    vertices[0] = 1;
    vertices[12] = 2;
    vertices[24] = 1;
    vertices[36] = 3;
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, topology: 'line-strip', vertices });

    const welded = weldMeshGeometryVertices(geometry);

    expect(welded.vertices.length).toBe(3 * 12);
    expect(Array.from(welded.indices!)).toEqual([0, 1, 0, 2]);
    expect(welded.topology).toBe('line-strip');
    expect(geometry.indices).toBeNull();
    expect(geometry.vertices.length).toBe(4 * 12);
  });

  it('compares complete packed records byte-for-byte', () => {
    const layout: VertexAttributeLayout = {
      attributes: [{ byteOffset: 0, format: 'unorm8x4', semantic: 'color0' }],
      stride: 4,
    };
    const vertices = new Float32Array(3);
    const bytes = new Uint8Array(vertices.buffer);
    bytes.set([255, 0, 0, 255], 0);
    bytes.set([0, 255, 0, 255], 4);
    bytes.set([255, 0, 0, 255], 8);

    const welded = weldMeshGeometryVertices(createMeshGeometry({ layout, vertices }));

    expect(welded.vertices.byteLength).toBe(8);
    expect(Array.from(new Uint8Array(welded.vertices.buffer))).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(Array.from(welded.indices!)).toEqual([0, 1, 0]);
  });

  it('remaps existing indices and preserves subset ranges', () => {
    const geometry = makeQuad();
    geometry.vertices.set(geometry.vertices.subarray(0, 12), 3 * 12);
    const welded = weldMeshGeometryVertices(geometry);
    expect(Array.from(welded.indices!)).toEqual([0, 1, 2, 2, 1, 0]);
    expect(welded.subsets).toEqual(geometry.subsets);
  });

  it('returns an unchanged deep clone for invalid source indices', () => {
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 4]),
      layout: CANONICAL_LAYOUT,
      vertices: new Float32Array(2 * 12),
    });
    const welded = weldMeshGeometryVertices(geometry);
    expect(welded).not.toBe(geometry);
    expect(Array.from(welded.indices!)).toEqual([0, 4]);
    expect(welded.vertices).not.toBe(geometry.vertices);
  });
});
