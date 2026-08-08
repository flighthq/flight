import { createAabb, createBoundingSphere } from '@flighthq/geometry/contract';
import type { VertexAttributeLayout } from '@flighthq/types/contract';

import { createMeshGeometry, invalidateMeshGeometry } from './meshGeometry';
import {
  computeMeshGeometryBoundingSphere,
  computeMeshGeometryBounds,
  computeMeshGeometryFlatNormals,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  ensureMeshGeometryBounds,
  refreshMeshGeometryBounds,
} from './meshGeometryCompute';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT } from './meshGeometryLayout';

const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// One CCW triangle in the XY plane (normal +Z) with a u-along-X, v-along-Y UV mapping.
function makeTriangle() {
  const vertices = new Float32Array(3 * 12);
  const setVertex = (i: number, px: number, py: number, u: number, v: number): void => {
    const b = i * 12;
    vertices[b] = px;
    vertices[b + 1] = py;
    vertices[b + 2] = 0;
    vertices[b + 10] = u;
    vertices[b + 11] = v;
  };
  setVertex(0, 0, 0, 0, 0);
  setVertex(1, 1, 0, 1, 0);
  setVertex(2, 0, 1, 0, 1);
  const indices = new Uint16Array([0, 1, 2]);
  return createMeshGeometry({ indices: indices, layout: CANONICAL_LAYOUT, vertices: vertices });
}

describe('computeMeshGeometryBoundingSphere', () => {
  it('writes the center and radius for a unit-side triangle', () => {
    const geometry = makeTriangle();
    const out = createBoundingSphere();
    computeMeshGeometryBoundingSphere(out, geometry);
    // AABB of the triangle: min=(0,0,0) max=(1,1,0) → center=(0.5,0.5,0).
    expect(out.center.x).toBeCloseTo(0.5);
    expect(out.center.y).toBeCloseTo(0.5);
    expect(out.center.z).toBeCloseTo(0);
    expect(out.radius).toBeGreaterThan(0);
  });

  it('radius encloses all vertices', () => {
    const geometry = makeTriangle();
    const out = createBoundingSphere();
    computeMeshGeometryBoundingSphere(out, geometry);
    const cx = out.center.x,
      cy = out.center.y,
      cz = out.center.z;
    const r = out.radius;
    const verts = geometry.vertices;
    for (let i = 0; i < 3; i++) {
      const dx = verts[i * 12] - cx;
      const dy = verts[i * 12 + 1] - cy;
      const dz = verts[i * 12 + 2] - cz;
      expect(Math.sqrt(dx * dx + dy * dy + dz * dz)).toBeLessThanOrEqual(r + 1e-6);
    }
  });

  it('yields empty sphere (radius -1) for an empty vertex stream', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) });
    const out = createBoundingSphere();
    computeMeshGeometryBoundingSphere(out, geometry);
    expect(out.radius).toBe(-1);
    expect(out.center.x).toBe(0);
    expect(out.center.y).toBe(0);
    expect(out.center.z).toBe(0);
  });
});

describe('computeMeshGeometryBounds', () => {
  it('writes the tight AABB of all positions', () => {
    const geometry = makeTriangle();
    const out = createAabb();
    computeMeshGeometryBounds(out, geometry);
    expect(out.min.x).toBe(0);
    expect(out.min.y).toBe(0);
    expect(out.max.x).toBe(1);
    expect(out.max.y).toBe(1);
    expect(out.max.z).toBe(0);
  });

  it('is safe when out aliases geometry bounds', () => {
    const geometry = makeTriangle();
    geometry.bounds = createAabb();
    computeMeshGeometryBounds(geometry.bounds, geometry);
    expect(geometry.bounds.max.x).toBe(1);
    expect(geometry.bounds.min.y).toBe(0);
  });

  it('yields an empty box for an empty vertex stream', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) });
    const out = createAabb(1, 2, 3, 4, 5, 6);
    computeMeshGeometryBounds(out, geometry);
    expect(out.min.x).toBe(Number.POSITIVE_INFINITY);
    expect(out.max.x).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('computeMeshGeometryFlatNormals', () => {
  it('writes the face normal to all three vertices of a CCW triangle (indexed)', () => {
    const geometry = makeTriangle();
    computeMeshGeometryFlatNormals(geometry, geometry);
    // All three vertices should have the face normal +Z.
    for (let i = 0; i < 3; i++) {
      expect(geometry.vertices[i * 12 + 3]).toBeCloseTo(0);
      expect(geometry.vertices[i * 12 + 4]).toBeCloseTo(0);
      expect(geometry.vertices[i * 12 + 5]).toBeCloseTo(1);
    }
  });

  it('writes the face normal to all three vertices of a CCW triangle (non-indexed)', () => {
    const vertices = new Float32Array(3 * 12);
    const setVertex = (i: number, px: number, py: number): void => {
      const b = i * 12;
      vertices[b] = px;
      vertices[b + 1] = py;
      vertices[b + 2] = 0;
    };
    setVertex(0, 0, 0);
    setVertex(1, 1, 0);
    setVertex(2, 0, 1);
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: vertices });
    computeMeshGeometryFlatNormals(geometry, geometry);
    for (let i = 0; i < 3; i++) {
      expect(geometry.vertices[i * 12 + 3]).toBeCloseTo(0);
      expect(geometry.vertices[i * 12 + 4]).toBeCloseTo(0);
      expect(geometry.vertices[i * 12 + 5]).toBeCloseTo(1);
    }
  });

  it('is safe when out aliases geometry (alias-safe)', () => {
    const geometry = makeTriangle();
    const prevVersion = geometry.version;
    computeMeshGeometryFlatNormals(geometry, geometry);
    expect(geometry.version).toBe(prevVersion + 1);
    expect(geometry.vertices[5]).toBeCloseTo(1);
  });

  it('bumps version', () => {
    const geometry = makeTriangle();
    const prevVersion = geometry.version;
    computeMeshGeometryFlatNormals(geometry, geometry);
    expect(geometry.version).toBe(prevVersion + 1);
  });

  it('produces unit-length normals', () => {
    const geometry = makeTriangle();
    computeMeshGeometryFlatNormals(geometry, geometry);
    for (let i = 0; i < 3; i++) {
      const nx = geometry.vertices[i * 12 + 3];
      const ny = geometry.vertices[i * 12 + 4];
      const nz = geometry.vertices[i * 12 + 5];
      expect(Math.sqrt(nx * nx + ny * ny + nz * nz)).toBeCloseTo(1);
    }
  });
});

describe('computeMeshGeometryNormals', () => {
  it('writes the unit face normal in-place for a CCW triangle', () => {
    const geometry = makeTriangle();
    computeMeshGeometryNormals(geometry, geometry);
    // Face normal of a CCW XY triangle is +Z.
    expect(geometry.vertices[3]).toBeCloseTo(0);
    expect(geometry.vertices[4]).toBeCloseTo(0);
    expect(geometry.vertices[5]).toBeCloseTo(1);
  });

  it('writes into a distinct out geometry', () => {
    const source = makeTriangle();
    const out = makeTriangle();
    computeMeshGeometryNormals(out, source);
    expect(out.vertices[5]).toBeCloseTo(1);
  });
});

describe('computeMeshGeometryTangents', () => {
  it('writes a unit tangent aligned with +X for the canonical UV mapping', () => {
    const geometry = makeTriangle();
    computeMeshGeometryNormals(geometry, geometry);
    const originalVertices = geometry.vertices;
    const originalIndices = geometry.indices;
    computeMeshGeometryTangents(geometry, geometry);
    // u increases along +X, so tangent.xyz ~ (1,0,0).
    expect(geometry.vertices[6]).toBeCloseTo(1);
    expect(geometry.vertices[7]).toBeCloseTo(0);
    expect(geometry.vertices[8]).toBeCloseTo(0);
    // Right-handed mapping => positive handedness.
    expect(geometry.vertices[9]).toBe(1);
    // The common single-handed case writes in place without replacing either payload buffer.
    expect(geometry.vertices).toBe(originalVertices);
    expect(geometry.indices).toBe(originalIndices);
  });

  it('writes into a distinct out geometry', () => {
    const source = makeTriangle();
    computeMeshGeometryNormals(source, source);
    const out = makeTriangle();
    computeMeshGeometryNormals(out, out);
    computeMeshGeometryTangents(out, source);
    expect(out.vertices[6]).toBeCloseTo(1);
    expect(out.vertices[9]).toBe(1);
  });

  it('produces negative handedness when the v axis is flipped', () => {
    const geometry = makeTriangle();
    // Flip v on vertex 2 so the UV winding reverses relative to geometry.
    geometry.vertices[2 * 12 + 11] = -1;
    computeMeshGeometryNormals(geometry, geometry);
    computeMeshGeometryTangents(geometry, geometry);
    expect(geometry.vertices[9]).toBe(-1);
  });

  it('splits shared vertices at a mirrored-UV handedness boundary', () => {
    // Two CCW triangles share vertices 0/2. Their UV determinants have opposite signs, so a single
    // tangent.w cannot describe both triangles: the shared records must be duplicated and remapped.
    const vertices = new Float32Array(4 * 12);
    setCanonicalVertex(vertices, 0, 0, 0, 0, 0);
    setCanonicalVertex(vertices, 1, 1, 0, 1, 0);
    setCanonicalVertex(vertices, 2, 0, 1, 0, 1);
    setCanonicalVertex(vertices, 3, -1, 0, 1, 0);
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      layout: CANONICAL_LAYOUT,
      vertices,
    });
    computeMeshGeometryNormals(geometry, geometry);
    const previousVersion = geometry.version;

    computeMeshGeometryTangents(geometry, geometry);

    expect(geometry.vertices.length / 12).toBe(6);
    expect(geometry.version).toBe(previousVersion + 1);
    const indices = geometry.indices!;
    const firstSign = geometry.vertices[indices[0] * 12 + 9];
    const mirroredSign = geometry.vertices[indices[3] * 12 + 9];
    expect(firstSign).toBe(1);
    expect(mirroredSign).toBe(-1);
    for (let corner = 0; corner < 3; corner++) {
      expect(geometry.vertices[indices[corner] * 12 + 9]).toBe(firstSign);
      expect(geometry.vertices[indices[corner + 3] * 12 + 9]).toBe(mirroredSign);
    }
    // Both shared corners moved on the mirrored triangle; the positive triangle kept the originals.
    expect(indices[0]).toBe(0);
    expect(indices[2]).toBe(2);
    expect(indices[3]).toBeGreaterThanOrEqual(4);
    expect(indices[4]).toBeGreaterThanOrEqual(4);
  });

  it('copies the complete skinned record when splitting a mirrored tangent seam', () => {
    const stride = CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.stride / 4;
    const vertices = new Float32Array(4 * stride);
    setSkinnedVertex(vertices, stride, 0, 0, 0, 0, 0, 10);
    setSkinnedVertex(vertices, stride, 1, 1, 0, 1, 0, 20);
    setSkinnedVertex(vertices, stride, 2, 0, 1, 0, 1, 30);
    setSkinnedVertex(vertices, stride, 3, -1, 0, 1, 0, 40);
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
      vertices,
    });
    computeMeshGeometryNormals(geometry, geometry);

    computeMeshGeometryTangents(geometry, geometry);

    const split = geometry.indices![3];
    expect(split).toBeGreaterThanOrEqual(4);
    // The split for source vertex 0 retains its joints0 and weights0 exactly. These channels are what
    // make a topologically repaired MD5 vertex continue following the same skeleton influences.
    expect(Array.from(geometry.vertices.subarray(split * stride + 12, split * stride + 16))).toEqual([10, 11, 12, 13]);
    expect(geometry.vertices[split * stride + 16]).toBeCloseTo(0.1);
    expect(geometry.vertices[split * stride + 17]).toBeCloseTo(0.2);
    expect(geometry.vertices[split * stride + 18]).toBeCloseTo(0.3);
    expect(geometry.vertices[split * stride + 19]).toBeCloseTo(0.4);
  });

  it('uses a unit perpendicular fallback for degenerate UVs', () => {
    const geometry = makeTriangle();
    for (let vertex = 0; vertex < 3; vertex++) {
      const base = vertex * 12;
      geometry.vertices[base + 3] = 1;
      geometry.vertices[base + 4] = 0;
      geometry.vertices[base + 5] = 0;
      geometry.vertices[base + 10] = 0;
      geometry.vertices[base + 11] = 0;
    }

    computeMeshGeometryTangents(geometry, geometry);

    const tx = geometry.vertices[6];
    const ty = geometry.vertices[7];
    const tz = geometry.vertices[8];
    expect(Math.hypot(tx, ty, tz)).toBeCloseTo(1);
    expect(tx).toBeCloseTo(0);
    expect(Math.abs(geometry.vertices[9])).toBe(1);
  });
});

function setCanonicalVertex(vertices: Float32Array, vertex: number, x: number, y: number, u: number, v: number): void {
  const base = vertex * 12;
  vertices[base] = x;
  vertices[base + 1] = y;
  vertices[base + 10] = u;
  vertices[base + 11] = v;
}

function setSkinnedVertex(
  vertices: Float32Array,
  stride: number,
  vertex: number,
  x: number,
  y: number,
  u: number,
  v: number,
  joint: number,
): void {
  const base = vertex * stride;
  vertices[base] = x;
  vertices[base + 1] = y;
  vertices[base + 10] = u;
  vertices[base + 11] = v;
  vertices[base + 12] = joint;
  vertices[base + 13] = joint + 1;
  vertices[base + 14] = joint + 2;
  vertices[base + 15] = joint + 3;
  vertices[base + 16] = 0.1;
  vertices[base + 17] = 0.2;
  vertices[base + 18] = 0.3;
  vertices[base + 19] = 0.4;
}

describe('ensureMeshGeometryBounds', () => {
  it('computes on first query, then reuses the cache until the version moves', () => {
    const geometry = makeTriangle();
    expect(geometry.bounds).toBeNull();

    const bounds = ensureMeshGeometryBounds(geometry);
    expect(bounds?.max.x).toBe(1);

    // A vertex edit WITHOUT a version bump must not be picked up — the version is the dirty signal,
    // and honouring the cache is what makes the steady-state query an integer compare.
    geometry.vertices[12] = 4;
    expect(ensureMeshGeometryBounds(geometry)?.max.x).toBe(1);

    // The public direct-write escape hatch marks the cache stale.
    invalidateMeshGeometry(geometry);
    expect(ensureMeshGeometryBounds(geometry)?.max.x).toBe(4);
  });

  it('trusts bounds supplied at construction without re-sweeping them', () => {
    const geometry = makeTriangle();
    refreshMeshGeometryBounds(geometry);
    const bounds = geometry.bounds;

    // Same AABB instance back, no recompute: the cache is valid for the current version.
    expect(ensureMeshGeometryBounds(geometry)).toBe(bounds);
  });
});

describe('refreshMeshGeometryBounds', () => {
  it('allocates once, then refreshes the same cached bounds after vertex edits', () => {
    const geometry = makeTriangle();
    expect(geometry.bounds).toBeNull();
    refreshMeshGeometryBounds(geometry);
    const bounds = geometry.bounds;
    expect(bounds?.max.x).toBe(1);

    geometry.vertices[12] = 4;
    refreshMeshGeometryBounds(geometry);
    expect(geometry.bounds).toBe(bounds);
    expect(bounds?.max.x).toBe(4);
  });
});
