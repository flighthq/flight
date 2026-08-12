import { createMatrix4, setMatrix4, setMatrix4Identity } from '@flighthq/geometry/contract';
import type { Aabb, VertexAttributeLayout } from '@flighthq/types/contract';

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

describe('mirror and non-uniform scale invariants', () => {
  // ★ THE FIXTURE IS THE POINT. `makeVertex` above is axis-aligned — normal (1,0,0), tangent
  // (0,1,0) — and under scale(2,1,1) the correct tangent transform and the inverse-transpose one
  // produce the SAME vector, so it cannot tell them apart. That is why a tangent transformed by the
  // wrong matrix survived here. These use a diagonal frame in the XY plane, where the two answers
  // differ. Do not "simplify" this fixture back to an axis-aligned one.
  function makeDiagonalFrameVertex() {
    const r = Math.SQRT1_2;
    const vertices = new Float32Array(12);
    vertices[0] = 1;
    vertices[3] = r;
    vertices[4] = r; // normal  ( .707,  .707, 0)
    vertices[6] = r;
    vertices[7] = -r; // tangent ( .707, -.707, 0)
    vertices[9] = 1; // handedness
    return createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices });
  }

  function normalDotTangent(geometry: ReturnType<typeof makeDiagonalFrameVertex>) {
    const v = geometry.vertices;
    return v[3] * v[6] + v[4] * v[7] + v[5] * v[8];
  }

  it('keeps the tangent on the surface under a non-uniform scale', () => {
    // A tangent is a true vector and follows the model matrix; a normal is a covector and follows
    // the inverse-transpose. Transform both with the inverse-transpose and the tangent tilts off
    // the surface — it stops being perpendicular to its own normal, which is what breaks the TBN
    // frame every normal-mapped material reconstructs.
    const geometry = makeDiagonalFrameVertex();
    const matrix = createMatrix4();
    setMatrix4(matrix, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    transformMeshGeometry(geometry, matrix);
    expect(normalDotTangent(geometry)).toBeCloseTo(0, 5);
  });

  it('keeps the tangent on the surface under scaleMeshGeometry too', () => {
    const geometry = makeDiagonalFrameVertex();
    scaleMeshGeometry(geometry, 2, 1, 1);
    expect(normalDotTangent(geometry)).toBeCloseTo(0, 5);
  });

  it('reverses indexed triangle winding and flips handedness when the transform mirrors', () => {
    // A baked mirror leaves no determinant behind for a renderer to detect, so the geometry would
    // upload inside-out under an identity model matrix. The correction has to happen at bake time.
    const vertices = new Float32Array(3 * 12);
    for (let v = 0; v < 3; v++) vertices[v * 12 + 9] = 1; // handedness on every vertex
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2]),
      layout: CANONICAL_LAYOUT,
      vertices,
    });
    scaleMeshGeometry(geometry, -1, 1, 1);
    expect(Array.from(geometry.indices!)).toEqual([0, 2, 1]);
    for (let v = 0; v < 3; v++) expect(geometry.vertices[v * 12 + 9]).toBe(-1);
  });

  it('reverses non-indexed triangle winding by swapping the records themselves', () => {
    // With no index array the record ORDER is the winding, so the second and third records of each
    // triple exchange places — and they must exchange whole, not just their positions.
    const vertices = new Float32Array(3 * 12);
    for (let v = 0; v < 3; v++) {
      vertices[v * 12] = v; // position.x identifies the record
      vertices[v * 12 + 10] = v; // uv0.u rides along to prove the whole record moved
    }
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices });
    scaleMeshGeometry(geometry, -1, 1, 1);
    expect([geometry.vertices[0], geometry.vertices[12], geometry.vertices[24]]).toEqual([0, -2, -1]);
    expect([geometry.vertices[10], geometry.vertices[22], geometry.vertices[34]]).toEqual([0, 2, 1]);
  });

  it('leaves winding and handedness alone when the transform does not mirror', () => {
    const vertices = new Float32Array(3 * 12);
    for (let v = 0; v < 3; v++) vertices[v * 12 + 9] = 1;
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2]),
      layout: CANONICAL_LAYOUT,
      vertices,
    });
    scaleMeshGeometry(geometry, 2, 3, 4);
    expect(Array.from(geometry.indices!)).toEqual([0, 1, 2]);
    for (let v = 0; v < 3; v++) expect(geometry.vertices[v * 12 + 9]).toBe(1);
  });

  it('flips strip handedness but leaves strip indices untouched', () => {
    // Handedness is per-vertex and topology-independent, so it is corrected here as everywhere.
    // The winding is NOT: a strip shares each vertex between up to three triangles, so a per-triple
    // swap does not describe it, and there is no established strip reversal in this repository to
    // follow. This pins the current, deliberate gap rather than claiming strips are handled.
    const vertices = new Float32Array(4 * 12);
    for (let v = 0; v < 4; v++) vertices[v * 12 + 9] = 1;
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 3]),
      layout: CANONICAL_LAYOUT,
      topology: 'triangle-strip',
      vertices,
    });
    scaleMeshGeometry(geometry, -1, 1, 1);
    expect(Array.from(geometry.indices!)).toEqual([0, 1, 2, 3]);
    for (let v = 0; v < 4; v++) expect(geometry.vertices[v * 12 + 9]).toBe(-1);
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
