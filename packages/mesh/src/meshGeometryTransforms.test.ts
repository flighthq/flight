import { createMatrix4, setMatrix4Identity } from '@flighthq/geometry';
import type { Aabb, VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import { computeMeshGeometryBounds } from './meshGeometryCompute';
import {
  centerMeshGeometry,
  scaleMeshGeometry,
  transformMeshGeometry,
  transformMeshGeometryInto,
  translateMeshGeometry,
} from './meshGeometryTransforms';

const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// One vertex at (1, 0, 0) with normal (1, 0, 0) and tangent (0, 1, 0, 1).
function makeVertex(px: number, py: number, pz: number) {
  const vertices = new Float32Array(12);
  vertices[0] = px;
  vertices[1] = py;
  vertices[2] = pz;
  vertices[3] = 1;
  vertices[4] = 0;
  vertices[5] = 0; // normal
  vertices[6] = 0;
  vertices[7] = 1;
  vertices[8] = 0;
  vertices[9] = 1; // tangent
  vertices[10] = 0;
  vertices[11] = 0;
  return createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices });
}

describe('centerMeshGeometry', () => {
  it('translates geometry so bounds center is at origin', () => {
    // Manually set bounds to span 0..4 on X.
    const v4 = new Float32Array(12 * 2);
    v4[0] = 0;
    v4[12] = 4;
    const multiGeo = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: v4 });
    computeMeshGeometryBounds(
      (multiGeo.bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 0, z: 0 } } as Aabb),
      multiGeo,
    );
    centerMeshGeometry(multiGeo);
    expect(multiGeo.vertices[0]).toBeCloseTo(-2);
    expect(multiGeo.vertices[12]).toBeCloseTo(2);
  });
  it('is a no-op when already centered', () => {
    const geo = makeVertex(0, 0, 0);
    const v0 = geo.version;
    // bounds already centered
    geo.bounds = { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } } as Aabb;
    // center is (0,0,0), skip
    centerMeshGeometry(geo);
    // no version bump because cx==cy==cz==0 -> early return
    expect(geo.version).toBe(v0);
  });
});

describe('scaleMeshGeometry', () => {
  it('scales positions by the given factors', () => {
    const geo = makeVertex(1, 2, 3);
    scaleMeshGeometry(geo, 2, 3, 4);
    expect(geo.vertices[0]).toBeCloseTo(2);
    expect(geo.vertices[1]).toBeCloseTo(6);
    expect(geo.vertices[2]).toBeCloseTo(12);
  });
  it('re-normalizes normals under non-uniform scale', () => {
    const geo = makeVertex(1, 0, 0);
    // normal is (1,0,0); after scale(2,1,1), normal should still be unit.
    scaleMeshGeometry(geo, 2, 1, 1);
    const nx = geo.vertices[3],
      ny = geo.vertices[4],
      nz = geo.vertices[5];
    expect(Math.sqrt(nx * nx + ny * ny + nz * nz)).toBeCloseTo(1);
  });
  it('bumps version', () => {
    const geo = makeVertex(1, 0, 0);
    const v0 = geo.version;
    scaleMeshGeometry(geo, 1, 1, 1);
    expect(geo.version).toBe(v0 + 1);
  });
});

describe('transformMeshGeometry', () => {
  it('applies translation to positions', () => {
    const geo = makeVertex(0, 0, 0);
    const m = createMatrix4();
    setMatrix4Identity(m);
    m.m[12] = 5;
    m.m[13] = 6;
    m.m[14] = 7; // translate column
    expect(transformMeshGeometry(geo, m)).toBe(true);
    expect(geo.vertices[0]).toBeCloseTo(5);
    expect(geo.vertices[1]).toBeCloseTo(6);
    expect(geo.vertices[2]).toBeCloseTo(7);
  });
  it('returns false for a singular matrix', () => {
    const geo = makeVertex(1, 0, 0);
    const m = createMatrix4();
    // zero matrix is singular
    for (let i = 0; i < 16; i++) m.m[i] = 0;
    expect(transformMeshGeometry(geo, m)).toBe(false);
  });
  it('bumps version on success', () => {
    const geo = makeVertex(1, 0, 0);
    const m = createMatrix4();
    setMatrix4Identity(m);
    const v0 = geo.version;
    transformMeshGeometry(geo, m);
    expect(geo.version).toBe(v0 + 1);
  });
});

describe('transformMeshGeometryInto', () => {
  it('alias-safe: works when out === source', () => {
    const geo = makeVertex(1, 0, 0);
    const m = createMatrix4();
    setMatrix4Identity(m);
    m.m[12] = 3;
    expect(transformMeshGeometryInto(geo, geo, m)).toBe(true);
    expect(geo.vertices[0]).toBeCloseTo(4);
  });
  it('distinct out: writes to out without modifying source', () => {
    const source = makeVertex(1, 0, 0);
    const out = makeVertex(0, 0, 0);
    const m = createMatrix4();
    setMatrix4Identity(m);
    m.m[12] = 2;
    expect(transformMeshGeometryInto(out, source, m)).toBe(true);
    expect(out.vertices[0]).toBeCloseTo(3);
    expect(source.vertices[0]).toBeCloseTo(1); // source unchanged
  });
});

describe('translateMeshGeometry', () => {
  it('offsets all positions by (x, y, z)', () => {
    const geo = makeVertex(1, 2, 3);
    translateMeshGeometry(geo, 10, 20, 30);
    expect(geo.vertices[0]).toBeCloseTo(11);
    expect(geo.vertices[1]).toBeCloseTo(22);
    expect(geo.vertices[2]).toBeCloseTo(33);
  });
  it('does not affect normals', () => {
    const geo = makeVertex(0, 0, 0);
    translateMeshGeometry(geo, 5, 5, 5);
    expect(geo.vertices[3]).toBe(1); // normal x unchanged
    expect(geo.vertices[4]).toBe(0);
    expect(geo.vertices[5]).toBe(0);
  });
  it('bumps version and updates bounds', () => {
    const geo = makeVertex(0, 0, 0);
    geo.bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } as Aabb;
    const v0 = geo.version;
    translateMeshGeometry(geo, 5, 0, 0);
    expect(geo.version).toBe(v0 + 1);
    expect(geo.bounds!.min.x).toBeCloseTo(5);
    expect(geo.bounds!.max.x).toBeCloseTo(5);
  });
});
