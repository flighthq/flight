import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import { offsetMeshGeometryUvs, scaleMeshGeometryUvs, wrapMeshGeometryUvs } from './meshGeometryUvs';

const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

const NO_UV_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

// Two-vertex geometry with known UV values.
function makeUvGeometry() {
  const vertices = new Float32Array(2 * 12);
  // Vertex 0: uv = (0.25, 0.75)
  vertices[0 * 12 + 10] = 0.25;
  vertices[0 * 12 + 11] = 0.75;
  // Vertex 1: uv = (0.5, 0.5)
  vertices[1 * 12 + 10] = 0.5;
  vertices[1 * 12 + 11] = 0.5;
  return createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: vertices });
}

describe('offsetMeshGeometryUvs', () => {
  it('shifts all UV coordinates by (du, dv)', () => {
    const geo = makeUvGeometry();
    offsetMeshGeometryUvs(geo, 0.1, 0.2);
    expect(geo.vertices[0 * 12 + 10]).toBeCloseTo(0.35);
    expect(geo.vertices[0 * 12 + 11]).toBeCloseTo(0.95);
    expect(geo.vertices[1 * 12 + 10]).toBeCloseTo(0.6);
    expect(geo.vertices[1 * 12 + 11]).toBeCloseTo(0.7);
  });
  it('bumps version', () => {
    const geo = makeUvGeometry();
    const prev = geo.version;
    offsetMeshGeometryUvs(geo, 0.1, 0.2);
    expect(geo.version).toBe(prev + 1);
  });
  it('does nothing when uv0 is absent from the layout', () => {
    const geo = createMeshGeometry({
      layout: NO_UV_LAYOUT,
      vertices: new Float32Array([1, 2, 3]),
    });
    const prev = geo.version;
    offsetMeshGeometryUvs(geo, 0.5, 0.5);
    expect(geo.version).toBe(prev);
  });
  it('does not bump version for an empty geometry', () => {
    const geo = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) });
    const prev = geo.version;
    offsetMeshGeometryUvs(geo, 1, 1);
    expect(geo.version).toBe(prev);
  });
});

describe('scaleMeshGeometryUvs', () => {
  it('scales all UV coordinates by (su, sv)', () => {
    const geo = makeUvGeometry();
    scaleMeshGeometryUvs(geo, 2, 4);
    expect(geo.vertices[0 * 12 + 10]).toBeCloseTo(0.5);
    expect(geo.vertices[0 * 12 + 11]).toBeCloseTo(3.0);
    expect(geo.vertices[1 * 12 + 10]).toBeCloseTo(1.0);
    expect(geo.vertices[1 * 12 + 11]).toBeCloseTo(2.0);
  });
  it('bumps version', () => {
    const geo = makeUvGeometry();
    const prev = geo.version;
    scaleMeshGeometryUvs(geo, 2, 2);
    expect(geo.version).toBe(prev + 1);
  });
  it('does nothing when uv0 is absent from the layout', () => {
    const geo = createMeshGeometry({
      layout: NO_UV_LAYOUT,
      vertices: new Float32Array([1, 2, 3]),
    });
    const prev = geo.version;
    scaleMeshGeometryUvs(geo, 2, 2);
    expect(geo.version).toBe(prev);
  });
});

describe('wrapMeshGeometryUvs', () => {
  it('wraps coordinates in [0, 1)', () => {
    const geo = makeUvGeometry();
    // Scale first so UVs go out of range.
    scaleMeshGeometryUvs(geo, 3, 3);
    wrapMeshGeometryUvs(geo);
    // vertex 0: u = 0.25*3 = 0.75 → 0.75, v = 0.75*3 = 2.25 → 0.25
    expect(geo.vertices[0 * 12 + 10]).toBeCloseTo(0.75);
    expect(geo.vertices[0 * 12 + 11]).toBeCloseTo(0.25);
    // vertex 1: u = 0.5*3 = 1.5 → 0.5, v = 0.5*3 = 1.5 → 0.5
    expect(geo.vertices[1 * 12 + 10]).toBeCloseTo(0.5);
    expect(geo.vertices[1 * 12 + 11]).toBeCloseTo(0.5);
  });
  it('maps exactly 1.0 to 0.0', () => {
    const vertices = new Float32Array(12);
    vertices[10] = 1.0;
    vertices[11] = 1.0;
    const geo = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: vertices });
    wrapMeshGeometryUvs(geo);
    expect(geo.vertices[10]).toBeCloseTo(0);
    expect(geo.vertices[11]).toBeCloseTo(0);
  });
  it('bumps version', () => {
    const geo = makeUvGeometry();
    const prev = geo.version;
    wrapMeshGeometryUvs(geo);
    expect(geo.version).toBe(prev + 1);
  });
  it('does nothing when uv0 is absent from the layout', () => {
    const geo = createMeshGeometry({
      layout: NO_UV_LAYOUT,
      vertices: new Float32Array([1, 2, 3]),
    });
    const prev = geo.version;
    wrapMeshGeometryUvs(geo);
    expect(geo.version).toBe(prev);
  });
});
