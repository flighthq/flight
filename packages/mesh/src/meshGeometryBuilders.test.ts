import type { MeshGeometry } from '@flighthq/types';

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
    expect(getMeshGeometryVertexCount(geometry)).toBeGreaterThan(0);
    expect(geometry.bounds!.min.y).toBeCloseTo(-1, 1);
    expect(geometry.bounds!.max.y).toBeCloseTo(1, 1);
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
  it('accepts custom vertex/face data', () => {
    const verts: ReadonlyArray<readonly [number, number, number]> = [
      [0, 1, 0],
      [-1, -1, 0],
      [1, -1, 0],
    ];
    const faces: ReadonlyArray<readonly [number, number, number]> = [[0, 1, 2]];
    const geometry = createPolyhedronMeshGeometry(verts, faces, 1, 0);
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
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
  });
});
