import { createAabb, createBoundingSphere } from '@flighthq/geometry';
import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import {
  computeMeshGeometryBoundingSphere,
  computeMeshGeometryBounds,
  computeMeshGeometryFlatNormals,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  refreshMeshGeometryBounds,
} from './meshGeometryCompute';

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
    computeMeshGeometryTangents(geometry, geometry);
    // u increases along +X, so tangent.xyz ~ (1,0,0).
    expect(geometry.vertices[6]).toBeCloseTo(1);
    expect(geometry.vertices[7]).toBeCloseTo(0);
    expect(geometry.vertices[8]).toBeCloseTo(0);
    // Right-handed mapping => positive handedness.
    expect(geometry.vertices[9]).toBe(1);
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
