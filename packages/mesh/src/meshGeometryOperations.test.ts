import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry, getMeshGeometryIndexCount, getMeshGeometryVertexCount } from './meshGeometry';
import { createBoxMeshGeometry, createQuadMeshGeometry } from './meshGeometryBuilders';
import {
  createMeshGeometryFromAttributes,
  getMeshGeometryTriangleCount,
  getMeshGeometryTriangleVertexIndices,
  mergeMeshGeometries,
  validateMeshGeometry,
} from './meshGeometryOperations';

const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

const POSITION_ONLY_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

describe('createMeshGeometryFromAttributes', () => {
  it('builds a triangle from positions only, computing normals', () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const indices = [0, 1, 2];
    const geo = createMeshGeometryFromAttributes({ indices, positions });
    expect(getMeshGeometryVertexCount(geo)).toBe(3);
    expect(getMeshGeometryIndexCount(geo)).toBe(3);
    // Normal should be +Z for this CCW XY triangle.
    expect(geo.vertices[5]).toBeCloseTo(1, 3);
  });
  it('uses supplied normals without recomputing', () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const normals = [0, 0, -1, 0, 0, -1, 0, 0, -1]; // explicit -Z normals
    const indices = [0, 1, 2];
    const geo = createMeshGeometryFromAttributes({ indices, normals, positions });
    expect(geo.vertices[5]).toBeCloseTo(-1, 3); // supplied -Z preserved
  });
  it('computes bounds', () => {
    const positions = [0, 0, 0, 2, 0, 0, 0, 2, 0];
    const geo = createMeshGeometryFromAttributes({ positions });
    expect(geo.bounds!.max.x).toBeCloseTo(2);
    expect(geo.bounds!.max.y).toBeCloseTo(2);
  });
});

describe('getMeshGeometryTriangleCount', () => {
  it('returns index/3 for triangle-list', () => {
    const geo = createBoxMeshGeometry();
    expect(getMeshGeometryTriangleCount(geo)).toBe(getMeshGeometryIndexCount(geo) / 3);
  });
  it('returns 0 for point-list', () => {
    const geo = createMeshGeometry({
      layout: CANONICAL_LAYOUT,
      topology: 'point-list',
      vertices: new Float32Array(12),
    });
    expect(getMeshGeometryTriangleCount(geo)).toBe(0);
  });
  it('returns indexCount - 2 for triangle-strip', () => {
    const verts = new Float32Array(4 * 12);
    const geo = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 3]),
      layout: CANONICAL_LAYOUT,
      topology: 'triangle-strip',
      vertices: verts,
    });
    expect(getMeshGeometryTriangleCount(geo)).toBe(2); // 4 - 2
  });
});

describe('getMeshGeometryTriangleVertexIndices', () => {
  it('resolves indexed and non-indexed triangle lists', () => {
    const indexed = createMeshGeometry({
      indices: new Uint16Array([2, 0, 1]),
      layout: POSITION_ONLY_LAYOUT,
      vertices: new Float32Array(9),
    });
    const out = { i0: -1, i1: -1, i2: -1 };
    expect(getMeshGeometryTriangleVertexIndices(out, indexed, 0)).toBe(true);
    expect(out).toEqual({ i0: 2, i1: 0, i2: 1 });

    const sequential = createMeshGeometry({ layout: POSITION_ONLY_LAYOUT, vertices: new Float32Array(9) });
    expect(getMeshGeometryTriangleVertexIndices(out, sequential, 0)).toBe(true);
    expect(out).toEqual({ i0: 0, i1: 1, i2: 2 });
  });

  it('alternates triangle-strip winding for indexed and non-indexed geometry', () => {
    const indexed = createMeshGeometry({
      indices: new Uint16Array([3, 1, 4, 2]),
      layout: POSITION_ONLY_LAYOUT,
      topology: 'triangle-strip',
      vertices: new Float32Array(15),
    });
    const out = { i0: -1, i1: -1, i2: -1 };
    expect(getMeshGeometryTriangleVertexIndices(out, indexed, 0)).toBe(true);
    expect(out).toEqual({ i0: 3, i1: 1, i2: 4 });
    expect(getMeshGeometryTriangleVertexIndices(out, indexed, 1)).toBe(true);
    expect(out).toEqual({ i0: 4, i1: 1, i2: 2 });

    const sequential = createMeshGeometry({
      layout: POSITION_ONLY_LAYOUT,
      topology: 'triangle-strip',
      vertices: new Float32Array(12),
    });
    expect(getMeshGeometryTriangleVertexIndices(out, sequential, 1)).toBe(true);
    expect(out).toEqual({ i0: 2, i1: 1, i2: 3 });
  });

  it('leaves out unchanged for unsupported topology and invalid indices', () => {
    const points = createMeshGeometry({
      layout: POSITION_ONLY_LAYOUT,
      topology: 'point-list',
      vertices: new Float32Array(9),
    });
    const out = { i0: 7, i1: 8, i2: 9 };
    expect(getMeshGeometryTriangleVertexIndices(out, points, 0)).toBe(false);
    expect(out).toEqual({ i0: 7, i1: 8, i2: 9 });

    const triangles = createMeshGeometry({ layout: POSITION_ONLY_LAYOUT, vertices: new Float32Array(9) });
    expect(getMeshGeometryTriangleVertexIndices(out, triangles, -1)).toBe(false);
    expect(getMeshGeometryTriangleVertexIndices(out, triangles, 1)).toBe(false);
    expect(out).toEqual({ i0: 7, i1: 8, i2: 9 });
  });
});

describe('mergeMeshGeometries', () => {
  it('returns null for empty array', () => {
    expect(mergeMeshGeometries([])).toBeNull();
  });
  it('returns null on layout mismatch', () => {
    const a = createQuadMeshGeometry();
    const b = createMeshGeometry({ layout: POSITION_ONLY_LAYOUT, vertices: new Float32Array(9) });
    expect(mergeMeshGeometries([a, b])).toBeNull();
  });
  it('concatenates vertices from two geometries', () => {
    const a = createQuadMeshGeometry();
    const b = createQuadMeshGeometry();
    const merged = mergeMeshGeometries([a, b]);
    expect(merged).not.toBeNull();
    expect(getMeshGeometryVertexCount(merged!)).toBe(getMeshGeometryVertexCount(a) + getMeshGeometryVertexCount(b));
  });
  it('offsets indices correctly', () => {
    const a = createQuadMeshGeometry(); // 4 verts, indices 0..3
    const b = createQuadMeshGeometry();
    const merged = mergeMeshGeometries([a, b]);
    const aVertCount = getMeshGeometryVertexCount(a);
    // All indices from `b` should be >= aVertCount in the merged geometry.
    const bIndexStart = a.indices ? a.indices.length : getMeshGeometryVertexCount(a);
    const bIndexCount = b.indices ? b.indices.length : getMeshGeometryVertexCount(b);
    for (let i = bIndexStart; i < bIndexStart + bIndexCount; i++) {
      expect(merged!.indices![i]).toBeGreaterThanOrEqual(aVertCount);
    }
  });
  it('recomputes bounds', () => {
    const a = createQuadMeshGeometry();
    const merged = mergeMeshGeometries([a, a]);
    expect(merged!.bounds).not.toBeNull();
  });
  it('carries per-source subsets', () => {
    const a = createQuadMeshGeometry();
    const b = createQuadMeshGeometry();
    const merged = mergeMeshGeometries([a, b]);
    expect(merged!.subsets.length).toBe(2);
    expect(merged!.subsets[0].indexOffset).toBe(0);
    expect(merged!.subsets[1].indexOffset).toBe(a.indices ? a.indices.length : getMeshGeometryVertexCount(a));
  });
});

describe('validateMeshGeometry', () => {
  it('returns true for a valid geometry', () => {
    expect(validateMeshGeometry(createBoxMeshGeometry())).toBe(true);
  });
  it('returns false when indices reference out-of-range vertices', () => {
    const geo = createMeshGeometry({
      indices: new Uint16Array([0, 1, 99]),
      layout: CANONICAL_LAYOUT,
      vertices: new Float32Array(3 * 12),
    });
    expect(validateMeshGeometry(geo)).toBe(false);
  });
  it('returns false when vertex stream is not stride-aligned', () => {
    const geo = createMeshGeometry({
      layout: CANONICAL_LAYOUT,
      // 13 floats is not a multiple of 12 (the stride in floats).
      vertices: new Float32Array(13),
    });
    // Override to force non-aligned stream.
    geo.vertices = new Float32Array(13);
    expect(validateMeshGeometry(geo)).toBe(false);
  });
  it('returns false when positions contain NaN', () => {
    const verts = new Float32Array(12);
    verts[0] = NaN;
    const geo = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: verts });
    expect(validateMeshGeometry(geo)).toBe(false);
  });
  it('returns false when positions contain Infinity', () => {
    const verts = new Float32Array(12);
    verts[2] = Infinity;
    const geo = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: verts });
    expect(validateMeshGeometry(geo)).toBe(false);
  });
});
