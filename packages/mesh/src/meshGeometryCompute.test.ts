import { createAabb } from '@flighthq/geometry';
import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import {
  computeMeshGeometryBounds,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
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
