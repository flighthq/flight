import { createAabb, createBoundingSphere } from '@flighthq/geometry/contract';
import type { MeshGeometry, VertexAttributeLayout } from '@flighthq/types/contract';

import { createMeshGeometry, invalidateMeshGeometry } from './meshGeometry';
import {
  computeMeshGeometryBoundingSphere,
  computeMeshGeometryBounds,
  computeMeshGeometryFlatNormals,
  computeMeshGeometryNormals,
  computeMeshGeometryPositionGroups,
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

function makeUvSeamFold() {
  const vertices = new Float32Array(6 * 12);
  const setVertex = (i: number, px: number, py: number, pz: number, u: number, v: number): void => {
    const base = i * 12;
    vertices[base] = px;
    vertices[base + 1] = py;
    vertices[base + 2] = pz;
    vertices[base + 10] = u;
    vertices[base + 11] = v;
  };
  // The first triangle has twice the area of the second. Vertices 0/3 and 1/4 are exact position
  // duplicates with distinct UVs across their shared edge.
  setVertex(0, 0, 0, 0, 0, 0);
  setVertex(1, 2, 0, 0, 1, 0);
  setVertex(2, 0, 2, 0, 0, 1);
  setVertex(3, 0, 0, 0, 0.25, 0.25);
  setVertex(4, 2, 0, 0, 0.75, 0.25);
  setVertex(5, 0, 0, 1, 0.25, 0.75);
  return createMeshGeometry({
    indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
    layout: CANONICAL_LAYOUT,
    vertices,
  });
}

function reconstructBitangent(vertices: Readonly<Float32Array>, vertex: number): [number, number, number] {
  const base = vertex * 12;
  const nx = vertices[base + 3];
  const ny = vertices[base + 4];
  const nz = vertices[base + 5];
  const tx = vertices[base + 6];
  const ty = vertices[base + 7];
  const tz = vertices[base + 8];
  const sign = vertices[base + 9];
  return [sign * (ny * tz - nz * ty), sign * (nz * tx - nx * tz), sign * (nx * ty - ny * tx)];
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

  it('bumps the output version after rewriting normals', () => {
    const source = makeTriangle();
    const out = makeTriangle();
    const previousVersion = out.version;

    computeMeshGeometryNormals(out, source);

    expect(out.version).toBe(previousVersion + 1);
  });

  it('keeps duplicated positions independent when position groups are omitted', () => {
    const geometry = makeUvSeamFold();

    computeMeshGeometryNormals(geometry, geometry);

    expect(Array.from(geometry.vertices.subarray(3, 6))).toEqual([0, 0, 1]);
    expect(Array.from(geometry.vertices.subarray(3 * 12 + 3, 3 * 12 + 6))).toEqual([0, -1, 0]);
  });

  it('area-weights face normals inside exact position groups before normalization', () => {
    const geometry = makeUvSeamFold();
    const groups = computeMeshGeometryPositionGroups(geometry);

    computeMeshGeometryNormals(geometry, geometry, groups);

    const expectedY = -1 / Math.sqrt(5);
    const expectedZ = 2 / Math.sqrt(5);
    for (const vertex of [0, 1, 3, 4]) {
      const base = vertex * 12 + 3;
      expect(geometry.vertices[base]).toBeCloseTo(0);
      expect(geometry.vertices[base + 1]).toBeCloseTo(expectedY);
      expect(geometry.vertices[base + 2]).toBeCloseTo(expectedZ);
    }
  });
});

describe('computeMeshGeometryPositionGroups', () => {
  it('returns the first exact-position vertex as each group representative', () => {
    const geometry = makeUvSeamFold();

    expect(Array.from(computeMeshGeometryPositionGroups(geometry))).toEqual([0, 1, 2, 0, 1, 5]);
  });

  it('does not group adjacent Float32 values', () => {
    const geometry = makeUvSeamFold();
    const bits = new Uint32Array(geometry.vertices.buffer);
    bits[3 * 12] = 1;

    expect(Array.from(computeMeshGeometryPositionGroups(geometry))).toEqual([0, 1, 2, 3, 1, 5]);
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

  it('keeps the reconstructed bitangent continuous across a grouped mirrored-UV seam', () => {
    const vertices = new Float32Array(6 * 12);
    // The duplicate seam position (vertices 0/3) sees different face frames on each side. The second
    // UV chart mirrors u: its tangent and handedness flip, while the shared bitangent must not.
    setCanonicalVertex(vertices, 0, 0, 0, 0, 0);
    setCanonicalVertex(vertices, 1, 1, 0, 1, 0);
    setCanonicalVertex(vertices, 2, 0, 1, 0, 1);
    setCanonicalVertex(vertices, 3, 0, 0, 0, 0);
    setCanonicalVertex(vertices, 4, -1, 0, 0, 1);
    setCanonicalVertex(vertices, 5, 0, -1, 1, 0);
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
      layout: CANONICAL_LAYOUT,
      vertices,
    });
    const groups = computeMeshGeometryPositionGroups(geometry);
    computeMeshGeometryNormals(geometry, geometry, groups);

    computeMeshGeometryTangents(geometry, geometry, groups);

    expect(geometry.vertices[9]).toBe(1);
    expect(geometry.vertices[3 * 12 + 9]).toBe(-1);
    const firstBitangent = reconstructBitangent(geometry.vertices, 0);
    const mirroredBitangent = reconstructBitangent(geometry.vertices, 3);
    expect(firstBitangent[0]).toBeCloseTo(-1 / Math.sqrt(2));
    expect(firstBitangent[1]).toBeCloseTo(1 / Math.sqrt(2));
    expect(firstBitangent[2]).toBeCloseTo(0);
    for (let component = 0; component < 3; component++) {
      expect(mirroredBitangent[component]).toBeCloseTo(firstBitangent[component]);
    }
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
    const groups = computeMeshGeometryPositionGroups(geometry);
    computeMeshGeometryNormals(geometry, geometry, groups);
    const previousVersion = geometry.version;

    computeMeshGeometryTangents(geometry, geometry, groups);

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
    const firstBitangent = reconstructBitangent(geometry.vertices, indices[0]);
    const mirroredBitangent = reconstructBitangent(geometry.vertices, indices[3]);
    for (let component = 0; component < 3; component++) {
      expect(mirroredBitangent[component]).toBeCloseTo(firstBitangent[component]);
    }
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

describe('triangle-strip topology', () => {
  // A four-vertex strip [0, 1, 2, 3] is two triangles; the same surface as a list is
  // [0, 1, 2, 2, 1, 3], including the winding flip the odd strip triangle carries. Every compute
  // pass must produce the same attributes from either spelling.
  //
  // The fixture is deliberately IRREGULAR — the fourth corner is lifted out of the plane and its
  // UV is skewed. A flat quad with axis-aligned UVs makes both triangles agree by accident: every
  // tangent comes out (1, 0, 0, 1) whichever topology is used, so the tangent pass looks correct
  // while ignoring topology entirely. The irregular corner is what makes the two disagree when the
  // second triangle is dropped.
  function createStripQuad(topology: 'triangle-list' | 'triangle-strip'): MeshGeometry {
    const vertices = new Float32Array(4 * 12);
    setCanonicalVertex(vertices, 0, 0, 0, 0, 0);
    setCanonicalVertex(vertices, 1, 1, 0, 1, 0);
    setCanonicalVertex(vertices, 2, 0, 1, 0, 1);
    setCanonicalVertex(vertices, 3, 1, 1, 0.3, 0.9);
    vertices[3 * 12 + 2] = 1; // lift the fourth corner out of the plane
    const indices = topology === 'triangle-strip' ? [0, 1, 2, 3] : [0, 1, 2, 2, 1, 3];
    return createMeshGeometry({
      indices: new Uint16Array(indices),
      layout: CANONICAL_LAYOUT,
      topology,
      vertices,
    });
  }

  function expectStripMatchesList(
    compute: (out: MeshGeometry, geometry: Readonly<MeshGeometry>) => void,
    offset: number,
    componentCount: number,
  ): void {
    const strip = createStripQuad('triangle-strip');
    const list = createStripQuad('triangle-list');
    compute(strip, strip);
    compute(list, list);
    for (let vertex = 0; vertex < 4; vertex++) {
      for (let component = 0; component < componentCount; component++) {
        expect(strip.vertices[vertex * 12 + offset + component]).toBeCloseTo(
          list.vertices[vertex * 12 + offset + component],
          5,
        );
      }
    }
  }

  it('computeMeshGeometryNormals reads a strip as two triangles, not one', () => {
    // Dropping the second triangle leaves vertex 3 at exactly (0, 0, 0) and vertices 1 and 2
    // carrying only the first triangle's contribution — three of the four wrong, not just the one
    // no earlier triangle referenced.
    expectStripMatchesList(computeMeshGeometryNormals, 3, 3);
  });

  it('computeMeshGeometryFlatNormals reads a strip as two triangles, not one', () => {
    expectStripMatchesList(computeMeshGeometryFlatNormals, 3, 3);
  });

  it('computeMeshGeometryTangents reads a strip as two triangles, not one', () => {
    // A vertex that accumulates nothing falls back to a unit perpendicular, so the dropped
    // triangle shows up here as a plausible-looking tangent rather than a zero — harder to spot by
    // eye than the zero normal, which is why it is asserted against the list rather than a literal.
    const strip = createStripQuad('triangle-strip');
    const list = createStripQuad('triangle-list');
    computeMeshGeometryNormals(strip, strip);
    computeMeshGeometryNormals(list, list);
    computeMeshGeometryTangents(strip, strip);
    computeMeshGeometryTangents(list, list);
    for (let vertex = 0; vertex < 4; vertex++) {
      for (let component = 0; component < 4; component++) {
        expect(strip.vertices[vertex * 12 + 6 + component]).toBeCloseTo(list.vertices[vertex * 12 + 6 + component], 5);
      }
    }
  });

  it('leaves no vertex of a strip without a normal', () => {
    // The symptom that reaches a renderer: an unreferenced vertex keeps the zero normal it was
    // allocated with, and lights as a black seam.
    const strip = createStripQuad('triangle-strip');
    computeMeshGeometryNormals(strip, strip);
    for (let vertex = 0; vertex < 4; vertex++) {
      const length = Math.hypot(
        strip.vertices[vertex * 12 + 3],
        strip.vertices[vertex * 12 + 4],
        strip.vertices[vertex * 12 + 5],
      );
      expect(length).toBeCloseTo(1, 5);
    }
  });
});
