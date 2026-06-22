import type { MeshGeometry } from '@flighthq/types';

import { getMeshGeometryIndexCount, getMeshGeometryVertexCount } from './meshGeometry';
import {
  createBoxMeshGeometry,
  createConeMeshGeometry,
  createCylinderMeshGeometry,
  createPlaneMeshGeometry,
  createQuadMeshGeometry,
  createSphereMeshGeometry,
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

describe('createQuadMeshGeometry', () => {
  it('builds a unit quad in the XY plane with +Z normals', () => {
    const geometry = createQuadMeshGeometry();
    expect(getMeshGeometryVertexCount(geometry)).toBe(4);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
    expect(geometry.vertices[5]).toBeCloseTo(1);
    expectUnitTangents(geometry);
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

describe('createTorusMeshGeometry', () => {
  it('builds a torus bounded by radius + tube', () => {
    const geometry = createTorusMeshGeometry(0.5, 0.2, 12, 24);
    expect(geometry.bounds!.max.x).toBeCloseTo(0.7, 2);
    expect(geometry.bounds!.max.z).toBeCloseTo(0.2, 2);
    expectUnitNormals(geometry);
  });
});
