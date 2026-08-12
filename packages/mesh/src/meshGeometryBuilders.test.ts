import type { MeshGeometry, MeshTriangleVertexIndices } from '@flighthq/types/contract';

import { getMeshGeometryIndexCount, getMeshGeometryVertexCount } from './meshGeometry';
import {
  createBoxMeshGeometry,
  createCapsuleMeshGeometry,
  createCircleMeshGeometry,
  createConeMeshGeometry,
  createCylinderMeshGeometry,
  createDodecahedronMeshGeometry,
  createIcosahedronMeshGeometry,
  createIcosphereMeshGeometry,
  createOctahedronMeshGeometry,
  createPlaneMeshGeometry,
  createPolyhedronMeshGeometry,
  createQuadMeshGeometry,
  createRingMeshGeometry,
  createSphereMeshGeometry,
  createTetrahedronMeshGeometry,
  createTorusKnotMeshGeometry,
  createTorusMeshGeometry,
} from './meshGeometryBuilders';
import { getMeshGeometryTriangleCount, getMeshGeometryTriangleVertexIndices } from './meshGeometryOperations';
import { validateMeshGeometry } from './meshGeometryOperations';

function expectUnitNormals(geometry: Readonly<MeshGeometry>): void {
  const count = getMeshGeometryVertexCount(geometry);
  const stride = 12;
  for (let i = 0; i < count; i++) {
    const b = i * stride + 3;
    const len = Math.hypot(geometry.vertices[b], geometry.vertices[b + 1], geometry.vertices[b + 2]);
    expect(len).toBeCloseTo(1, 4);
  }
}

function expectUnitTangents(geometry: Readonly<MeshGeometry>): void {
  const count = getMeshGeometryVertexCount(geometry);
  const stride = 12;
  for (let i = 0; i < count; i++) {
    const b = i * stride + 6;
    const len = Math.hypot(geometry.vertices[b], geometry.vertices[b + 1], geometry.vertices[b + 2]);
    expect(len).toBeCloseTo(1, 4);
    expect(Math.abs(geometry.vertices[b + 3])).toBe(1);
  }
}

function expectFiniteCanonicalRecord(geometry: Readonly<MeshGeometry>): void {
  for (const value of geometry.vertices) expect(Number.isFinite(value)).toBe(true);
}

// Asserts a triangle's geometric face normal agrees with its vertices' averaged shading normal, so
// the winding (CCW front-facing) matches the outward-pointing normals the builder emits. A back-
// facing wind would be culled and expose the interior surface instead. Scans from the first triangle
// to the first non-degenerate one, skipping the zero-area pole triangles UV-sphere fans produce.
function expectWindingMatchesNormals(geometry: Readonly<MeshGeometry>): void {
  const stride = 12;
  const p = (index: number, offset: number): number => geometry.vertices[index * stride + offset];
  const indices = geometry.indices;
  expect(indices).not.toBeNull();
  if (indices === null) return;
  const indexCount = indices.length;
  for (let t = 0; t + 2 < indexCount; t += 3) {
    const i0 = indices[t];
    const i1 = indices[t + 1];
    const i2 = indices[t + 2];
    // Right-hand rule over the winding order: (p1 - p0) × (p2 - p0) faces front for CCW triangles.
    const ex = [p(i1, 0) - p(i0, 0), p(i1, 1) - p(i0, 1), p(i1, 2) - p(i0, 2)];
    const ey = [p(i2, 0) - p(i0, 0), p(i2, 1) - p(i0, 1), p(i2, 2) - p(i0, 2)];
    const faceNormal = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
    if (Math.hypot(faceNormal[0], faceNormal[1], faceNormal[2]) < 1e-6) continue;
    const avgNormal = [0, 0, 0];
    for (const index of [i0, i1, i2]) {
      avgNormal[0] += p(index, 3);
      avgNormal[1] += p(index, 4);
      avgNormal[2] += p(index, 5);
    }
    const dot = faceNormal[0] * avgNormal[0] + faceNormal[1] * avgNormal[1] + faceNormal[2] * avgNormal[2];
    expect(dot).toBeGreaterThan(0);
    return;
  }
  throw new Error('no non-degenerate triangle found');
}

describe('createBoxMeshGeometry', () => {
  it('builds 24 vertices, 36 indices, and bounds at the half-extents', () => {
    const geometry = createBoxMeshGeometry(2, 4, 6);
    expect(getMeshGeometryVertexCount(geometry)).toBe(24);
    expect(getMeshGeometryIndexCount(geometry)).toBe(36);
    expect(geometry.bounds!.min.x).toBeCloseTo(-1);
    expect(geometry.bounds!.max.y).toBeCloseTo(2);
    expect(geometry.bounds!.max.z).toBeCloseTo(3);
    expectUnitNormals(geometry);
    expectUnitTangents(geometry);
  });
});

describe('createCapsuleMeshGeometry', () => {
  it('builds a capsule that spans -(height/2+radius)..(height/2+radius) on Y', () => {
    const geometry = createCapsuleMeshGeometry(0.5, 1, 8, 4);
    expect(getMeshGeometryVertexCount(geometry)).toBe(90);
    expect(getMeshGeometryIndexCount(geometry)).toBe(432);
    expect(geometry.bounds!.min.y).toBeCloseTo(-1, 1);
    expect(geometry.bounds!.max.y).toBeCloseTo(1, 1);

    const stride = 12;
    const ringVertexCount = 9;
    const topEquator = 4 * ringVertexCount * stride;
    const bottomEquator = 5 * ringVertexCount * stride;
    expect(geometry.vertices[topEquator]).toBeCloseTo(0.5);
    expect(geometry.vertices[topEquator + 1]).toBeCloseTo(0.5);
    expect(geometry.vertices[topEquator + 4]).toBeCloseTo(0);
    expect(geometry.vertices[topEquator + 11]).toBeCloseTo(4 / 9);
    expect(geometry.vertices[bottomEquator]).toBeCloseTo(0.5);
    expect(geometry.vertices[bottomEquator + 1]).toBeCloseTo(-0.5);
    expect(geometry.vertices[bottomEquator + 4]).toBeCloseTo(0);
    expect(geometry.vertices[bottomEquator + 11]).toBeCloseTo(5 / 9);
    expectUnitNormals(geometry);
  });
});

describe('createCircleMeshGeometry', () => {
  it('builds a filled disc with segments triangles', () => {
    const geometry = createCircleMeshGeometry(0.5, 16);
    // 1 center + 17 rim (segments+1) = 18 vertices; 16 triangles = 48 indices.
    expect(getMeshGeometryIndexCount(geometry)).toBe(48);
    expect(geometry.bounds!.max.x).toBeCloseTo(0.5, 2);
    expectUnitNormals(geometry);
  });
});

describe('createConeMeshGeometry', () => {
  it('builds a capped cone with an apex at +Y', () => {
    const geometry = createConeMeshGeometry(0.5, 2, 16);
    expect(getMeshGeometryVertexCount(geometry)).toBeGreaterThan(0);
    expect(geometry.bounds!.max.y).toBeCloseTo(1);
    expect(geometry.bounds!.min.y).toBeCloseTo(-1);
    expectUnitNormals(geometry);
  });
});

describe('createCylinderMeshGeometry', () => {
  it('builds a capped cylinder bounded by its radius and height', () => {
    const geometry = createCylinderMeshGeometry(0.5, 0.5, 2, 16);
    expect(geometry.bounds!.max.y).toBeCloseTo(1);
    expect(geometry.bounds!.max.x).toBeCloseTo(0.5, 2);
    expectUnitNormals(geometry);
    expectUnitTangents(geometry);
  });

  it('keeps cylinder and cone records finite when height is zero', () => {
    const cylinder = createCylinderMeshGeometry(0.5, 0.5, 0, 8);
    const cone = createConeMeshGeometry(0.5, 0, 8);
    expectFiniteCanonicalRecord(cylinder);
    expectFiniteCanonicalRecord(cone);
    expect(validateMeshGeometry(cylinder)).toBe(true);
    expect(validateMeshGeometry(cone)).toBe(true);
  });
});

describe('createDodecahedronMeshGeometry', () => {
  it('produces a non-empty geometry with positive vertex count', () => {
    const geometry = createDodecahedronMeshGeometry(0.5);
    expect(getMeshGeometryVertexCount(geometry)).toBeGreaterThan(0);
    expectUnitNormals(geometry);
  });
});

describe('createIcosahedronMeshGeometry', () => {
  it('builds 20 triangles at detail=0', () => {
    const geometry = createIcosahedronMeshGeometry(0.5);
    // 20 faces × 3 independent verts = 60 vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(60);
    expectUnitNormals(geometry);
  });
});

describe('createIcosphereMeshGeometry', () => {
  it('builds a sphere with evenly distributed vertices', () => {
    const geometry = createIcosphereMeshGeometry(1, 1);
    // Each icosahedron face is subdivided into 4, giving 20×4 = 80 faces × 3 = 240 verts.
    expect(getMeshGeometryVertexCount(geometry)).toBe(240);
    const count = getMeshGeometryVertexCount(geometry);
    // All vertices should lie on the unit sphere.
    for (let i = 0; i < count; i++) {
      const b = i * 12;
      const r = Math.hypot(geometry.vertices[b], geometry.vertices[b + 1], geometry.vertices[b + 2]);
      expect(r).toBeCloseTo(1, 3);
    }
    expectUnitNormals(geometry);
  });
});

describe('createOctahedronMeshGeometry', () => {
  it('builds 8 triangles at detail=0', () => {
    const geometry = createOctahedronMeshGeometry(0.5);
    // 8 faces × 3 verts = 24 vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(24);
    expectUnitNormals(geometry);
  });
});

describe('createPlaneMeshGeometry', () => {
  it('builds a subdivided plane in the XZ plane with +Y normals', () => {
    const geometry = createPlaneMeshGeometry(2, 2, 2, 2);
    expect(getMeshGeometryVertexCount(geometry)).toBe(9);
    expect(getMeshGeometryIndexCount(geometry)).toBe(24);
    expect(geometry.vertices[4]).toBeCloseTo(1);
    expect(geometry.bounds!.min.x).toBeCloseTo(-1);
    expect(geometry.bounds!.max.z).toBeCloseTo(1);
  });
});

describe('createPolyhedronMeshGeometry', () => {
  const TRIANGLE_VERTS: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 0],
    [-1, -1, 0],
    [1, -1, 0],
  ];
  const ONE_FACE: ReadonlyArray<readonly [number, number, number]> = [[0, 1, 2]];

  // The name promises the custom data is USED. A vertex count alone cannot tell that from a builder
  // that ignored both arguments and emitted any three vertices, so the seed positions are asserted
  // through to the output — projected onto the radius sphere, which is what this builder does with them.
  it('projects the supplied vertices onto the radius sphere', () => {
    const geometry = createPolyhedronMeshGeometry(TRIANGLE_VERTS, ONE_FACE, 2, 0);

    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    const floatsPerVertex = geometry.layout.stride / 4;
    // The first seed is already unit length on +Y, so it lands on the sphere pole at the given radius.
    expect(geometry.vertices[0]).toBeCloseTo(0, 6);
    expect(geometry.vertices[1]).toBeCloseTo(2, 6);
    expect(geometry.vertices[2]).toBeCloseTo(0, 6);
    for (let v = 0; v < 3; v++) {
      const base = v * floatsPerVertex;
      expect(Math.hypot(geometry.vertices[base], geometry.vertices[base + 1], geometry.vertices[base + 2])).toBeCloseTo(
        2,
        6,
      );
      // Normals are the unit direction, independent of radius.
      expect(
        Math.hypot(geometry.vertices[base + 3], geometry.vertices[base + 4], geometry.vertices[base + 5]),
      ).toBeCloseTo(1, 6);
    }
  });

  // Different seed data must produce different geometry — the assertion the count-only version could
  // not make, and the one that fails if the arguments are ever ignored.
  it('produces different geometry for different seed vertices', () => {
    const a = createPolyhedronMeshGeometry(TRIANGLE_VERTS, ONE_FACE, 1, 0);
    const b = createPolyhedronMeshGeometry(
      [
        [0, 0, 1],
        [0, 1, 0],
        [1, 0, 0],
      ],
      ONE_FACE,
      1,
      0,
    );

    expect(Array.from(a.vertices)).not.toEqual(Array.from(b.vertices));
  });

  // Each subdivision splits every face into four, so the triangle count multiplies by four per level.
  it.each([
    [0, 3],
    [1, 12],
    [2, 48],
  ])('subdivides to %i levels giving %i vertices', (detail, expected) => {
    expect(getMeshGeometryVertexCount(createPolyhedronMeshGeometry(TRIANGLE_VERTS, ONE_FACE, 1, detail))).toBe(
      expected,
    );
  });

  it('keeps every subdivided vertex on the sphere', () => {
    const geometry = createPolyhedronMeshGeometry(TRIANGLE_VERTS, ONE_FACE, 3, 2);

    const floatsPerVertex = geometry.layout.stride / 4;
    for (let v = 0; v < getMeshGeometryVertexCount(geometry); v++) {
      const base = v * floatsPerVertex;
      expect(Math.hypot(geometry.vertices[base], geometry.vertices[base + 1], geometry.vertices[base + 2])).toBeCloseTo(
        3,
        5,
      );
    }
  });
});

describe('createQuadMeshGeometry', () => {
  it('builds a unit quad in the XY plane with +Z normals', () => {
    const geometry = createQuadMeshGeometry();
    expect(getMeshGeometryVertexCount(geometry)).toBe(4);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
    expect(geometry.vertices[5]).toBeCloseTo(1);
    expectUnitTangents(geometry);
  });
});

describe('createRingMeshGeometry', () => {
  it('builds a ring bounded by outerRadius', () => {
    const geometry = createRingMeshGeometry(0.25, 0.5, 16);
    expect(getMeshGeometryVertexCount(geometry)).toBeGreaterThan(0);
    expect(geometry.bounds!.max.x).toBeCloseTo(0.5, 2);
    expectUnitNormals(geometry);
  });
});

describe('createSphereMeshGeometry', () => {
  it('builds a sphere whose vertices lie on the radius', () => {
    const geometry = createSphereMeshGeometry(1, 16, 8);
    const count = getMeshGeometryVertexCount(geometry);
    for (let i = 0; i < count; i++) {
      const b = i * 12;
      const r = Math.hypot(geometry.vertices[b], geometry.vertices[b + 1], geometry.vertices[b + 2]);
      expect(r).toBeCloseTo(1, 4);
    }
    expectUnitNormals(geometry);
    expectWindingMatchesNormals(geometry);
  });
});

describe('createTetrahedronMeshGeometry', () => {
  it('builds 4 triangles at detail=0', () => {
    const geometry = createTetrahedronMeshGeometry(0.5);
    // 4 faces × 3 verts = 12 vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(12);
    expectUnitNormals(geometry);
  });
});

describe('createTorusKnotMeshGeometry', () => {
  it('produces a non-empty geometry', () => {
    const geometry = createTorusKnotMeshGeometry(0.5, 0.15, 32, 8);
    expect(getMeshGeometryVertexCount(geometry)).toBeGreaterThan(0);
    expect(getMeshGeometryIndexCount(geometry)).toBeGreaterThan(0);
  });
});

describe('createTorusMeshGeometry', () => {
  it('builds a torus bounded by radius + tube', () => {
    const geometry = createTorusMeshGeometry(0.5, 0.2, 12, 24);
    expect(geometry.bounds!.max.x).toBeCloseTo(0.7, 2);
    expect(geometry.bounds!.max.z).toBeCloseTo(0.2, 2);
    expectUnitNormals(geometry);
    expectWindingMatchesNormals(geometry);
  });
});

describe('mesh builder count inputs', () => {
  const polyhedronVertices: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 0],
    [-1, -1, 0],
    [1, -1, 0],
  ];
  const polyhedronFaces: ReadonlyArray<readonly [number, number, number]> = [[0, 1, 2]];

  it.each([
    ['capsule', () => createCapsuleMeshGeometry(0.5, 1, 3.5, 1.5), () => createCapsuleMeshGeometry(0.5, 1, 3, 1)],
    ['circle', () => createCircleMeshGeometry(0.5, 3.5), () => createCircleMeshGeometry(0.5, 3)],
    ['cone', () => createConeMeshGeometry(0.5, 1, 3.5), () => createConeMeshGeometry(0.5, 1, 3)],
    ['cylinder', () => createCylinderMeshGeometry(0.5, 0.5, 1, 3.5), () => createCylinderMeshGeometry(0.5, 0.5, 1, 3)],
    ['dodecahedron', () => createDodecahedronMeshGeometry(0.5, 1.5), () => createDodecahedronMeshGeometry(0.5, 1)],
    ['icosahedron', () => createIcosahedronMeshGeometry(0.5, 1.5), () => createIcosahedronMeshGeometry(0.5, 1)],
    ['icosphere', () => createIcosphereMeshGeometry(0.5, 1.5), () => createIcosphereMeshGeometry(0.5, 1)],
    ['octahedron', () => createOctahedronMeshGeometry(0.5, 1.5), () => createOctahedronMeshGeometry(0.5, 1)],
    ['plane', () => createPlaneMeshGeometry(1, 1, 1.5, 1.5), () => createPlaneMeshGeometry(1, 1, 1, 1)],
    [
      'polyhedron',
      () => createPolyhedronMeshGeometry(polyhedronVertices, polyhedronFaces, 0.5, 1.5),
      () => createPolyhedronMeshGeometry(polyhedronVertices, polyhedronFaces, 0.5, 1),
    ],
    ['ring', () => createRingMeshGeometry(0.25, 0.5, 3.5), () => createRingMeshGeometry(0.25, 0.5, 3)],
    ['sphere', () => createSphereMeshGeometry(0.5, 3.5, 2.5), () => createSphereMeshGeometry(0.5, 3, 2)],
    [
      'torus knot',
      () => createTorusKnotMeshGeometry(0.5, 0.15, 3.5, 3.5),
      () => createTorusKnotMeshGeometry(0.5, 0.15, 3, 3),
    ],
    ['torus', () => createTorusMeshGeometry(0.5, 0.2, 3.5, 3.5), () => createTorusMeshGeometry(0.5, 0.2, 3, 3)],
  ])('floors every fractional %s count and produces a valid mesh', (_name, fractional, floored) => {
    const actual = fractional();
    const expected = floored();
    expect(validateMeshGeometry(actual)).toBe(true);
    expect(getMeshGeometryVertexCount(actual)).toBe(getMeshGeometryVertexCount(expected));
    expect(getMeshGeometryIndexCount(actual)).toBe(getMeshGeometryIndexCount(expected));
  });

  it.each([
    ['capsule radialSegments', (value: number) => createCapsuleMeshGeometry(0.5, 1, value, 1)],
    ['capsule capSegments', (value: number) => createCapsuleMeshGeometry(0.5, 1, 3, value)],
    ['circle segments', (value: number) => createCircleMeshGeometry(0.5, value)],
    ['cone radialSegments', (value: number) => createConeMeshGeometry(0.5, 1, value)],
    ['cylinder radialSegments', (value: number) => createCylinderMeshGeometry(0.5, 0.5, 1, value)],
    ['dodecahedron detail', (value: number) => createDodecahedronMeshGeometry(0.5, value)],
    ['icosahedron detail', (value: number) => createIcosahedronMeshGeometry(0.5, value)],
    ['icosphere subdivisions', (value: number) => createIcosphereMeshGeometry(0.5, value)],
    ['octahedron detail', (value: number) => createOctahedronMeshGeometry(0.5, value)],
    ['plane widthSegments', (value: number) => createPlaneMeshGeometry(1, 1, value, 1)],
    ['plane depthSegments', (value: number) => createPlaneMeshGeometry(1, 1, 1, value)],
    [
      'polyhedron detail',
      (value: number) => createPolyhedronMeshGeometry(polyhedronVertices, polyhedronFaces, 0.5, value),
    ],
    ['ring segments', (value: number) => createRingMeshGeometry(0.25, 0.5, value)],
    ['sphere widthSegments', (value: number) => createSphereMeshGeometry(0.5, value, 2)],
    ['sphere heightSegments', (value: number) => createSphereMeshGeometry(0.5, 3, value)],
    ['tetrahedron detail', (value: number) => createTetrahedronMeshGeometry(0.5, value)],
    ['torus knot tubularSegments', (value: number) => createTorusKnotMeshGeometry(0.5, 0.15, value, 3)],
    ['torus knot radialSegments', (value: number) => createTorusKnotMeshGeometry(0.5, 0.15, 3, value)],
    ['torus radialSegments', (value: number) => createTorusMeshGeometry(0.5, 0.2, value, 3)],
    ['torus tubularSegments', (value: number) => createTorusMeshGeometry(0.5, 0.2, 3, value)],
  ])('rejects non-finite %s', (_name, build) => {
    expect(() => build(Number.NaN)).toThrow(RangeError);
    expect(() => build(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

// Longitude wraps at u = 0/1, so a face straddling the seam gets corners like 0.99 and 0.01 and
// interpolates BACKWARDS across the whole texture — the entire map crushed into one triangle. The
// unmistakable signature is a single face holding a corner near 0 AND a corner near 1; after the
// correction lifts the low corners past 1, no face carries both.
//
// Emitting per-face vertices is what makes the correction POSSIBLE (a shared vertex could only hold one
// u) but it does not perform it, and for a long time only the first half was here.
describe('spherical UV seam', () => {
  it.each([
    ['icosahedron', () => createIcosahedronMeshGeometry()],
    ['dodecahedron', () => createDodecahedronMeshGeometry()],
    ['octahedron', () => createOctahedronMeshGeometry()],
    ['tetrahedron', () => createTetrahedronMeshGeometry()],
    ['icosphere', () => createIcosphereMeshGeometry()],
  ])('gives no %s face corners at both ends of the longitude range', (_name, build) => {
    const geometry = build();
    const floatsPerVertex = geometry.layout.stride / 4;
    const corner: MeshTriangleVertexIndices = { i0: 0, i1: 0, i2: 0 };

    for (let t = 0; t < getMeshGeometryTriangleCount(geometry); t++) {
      if (!getMeshGeometryTriangleVertexIndices(corner, geometry, t)) continue;
      const us = [corner.i0, corner.i1, corner.i2].map((i) => geometry.vertices[i * floatsPerVertex + 10]);
      const wrapped = Math.min(...us) < 0.1 && Math.max(...us) > 0.9;
      expect(wrapped).toBe(false);
    }
  });

  // A pole vertex sits on the Y axis, where every meridian meets, so atan2 hands it an arbitrary
  // longitude unrelated to the face it belongs to — u = 0.5 while its face-mates sit near 1.0 and 1.25,
  // stretching the face across half the texture. Having no longitude of its own to preserve, it takes
  // the average of its face-mates and therefore must lie BETWEEN them.
  it.each([
    ['octahedron', () => createOctahedronMeshGeometry()],
    ['icosphere', () => createIcosphereMeshGeometry()],
  ])('places a %s pole vertex between its face-mates in longitude', (_name, build) => {
    const geometry = build();
    const floatsPerVertex = geometry.layout.stride / 4;
    const corner: MeshTriangleVertexIndices = { i0: 0, i1: 0, i2: 0 };
    let polesSeen = 0;

    for (let t = 0; t < getMeshGeometryTriangleCount(geometry); t++) {
      if (!getMeshGeometryTriangleVertexIndices(corner, geometry, t)) continue;
      const indices = [corner.i0, corner.i1, corner.i2];
      const horizontalRadius = indices.map((i) =>
        Math.hypot(geometry.vertices[i * floatsPerVertex], geometry.vertices[i * floatsPerVertex + 2]),
      );
      const poleSlot = horizontalRadius.findIndex((r) => r <= 1e-6);
      if (poleSlot < 0) continue;
      polesSeen++;
      const us = indices.map((i) => geometry.vertices[i * floatsPerVertex + 10]);
      const mates = us.filter((_, k) => k !== poleSlot);
      expect(us[poleSlot]).toBeGreaterThanOrEqual(Math.min(...mates));
      expect(us[poleSlot]).toBeLessThanOrEqual(Math.max(...mates));
    }

    // The fixture has to contain pole faces or the assertions above never run.
    expect(polesSeen).toBeGreaterThan(0);
  });

  // A corrected face legitimately carries u above 1: no parameterisation confined to 0..1 can express
  // a face crossing the seam continuously. Sampling wraps it, so this is the intended state, not drift.
  it('lifts a seam face past 1 rather than clamping it into range', () => {
    const geometry = createIcosahedronMeshGeometry();
    const floatsPerVertex = geometry.layout.stride / 4;

    let maxU = -Infinity;
    for (let v = 0; v < getMeshGeometryVertexCount(geometry); v++) {
      maxU = Math.max(maxU, geometry.vertices[v * floatsPerVertex + 10]);
    }

    expect(maxU).toBeGreaterThan(1);
  });
});
