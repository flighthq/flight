import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import {
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexTangent,
  getMeshGeometryVertexUv0,
  getVertexAttribute,
  getVertexAttributeFloatOffset,
  setMeshGeometryVertexNormal,
  setMeshGeometryVertexPosition,
  setMeshGeometryVertexTangent,
  setMeshGeometryVertexUv0,
} from './meshGeometryAttributes';

const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// One vertex with known values: pos=(1,2,3) normal=(0,1,0) tangent=(1,0,0,1) uv=(0.5,0.75).
function makeOneVertex() {
  const vertices = new Float32Array(12);
  vertices[0] = 1;
  vertices[1] = 2;
  vertices[2] = 3; // position
  vertices[3] = 0;
  vertices[4] = 1;
  vertices[5] = 0; // normal
  vertices[6] = 1;
  vertices[7] = 0;
  vertices[8] = 0;
  vertices[9] = 1; // tangent
  vertices[10] = 0.5;
  vertices[11] = 0.75; // uv0
  return createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices });
}

describe('getMeshGeometryVertexNormal', () => {
  it('reads the normal of the given vertex', () => {
    const geo = makeOneVertex();
    const out = { x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexNormal(out, geo, 0)).toBe(true);
    expect(out.x).toBe(0);
    expect(out.y).toBe(1);
    expect(out.z).toBe(0);
  });
  it('returns false for out-of-range index', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexNormal(out, makeOneVertex(), 1)).toBe(false);
  });
  it('returns false when layout has no normal', () => {
    const layout: VertexAttributeLayout = {
      attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
      stride: 12,
    };
    const geo = createMeshGeometry({ layout, vertices: new Float32Array(3) });
    const out = { x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexNormal(out, geo, 0)).toBe(false);
  });
});

describe('getMeshGeometryVertexPosition', () => {
  it('reads the position of the given vertex', () => {
    const geo = makeOneVertex();
    const out = { x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexPosition(out, geo, 0)).toBe(true);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });
  it('returns false for out-of-range index', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexPosition(out, makeOneVertex(), -1)).toBe(false);
  });
});

describe('getMeshGeometryVertexTangent', () => {
  it('reads the tangent including w', () => {
    const geo = makeOneVertex();
    const out = { w: 0, x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexTangent(out, geo, 0)).toBe(true);
    expect(out.x).toBe(1);
    expect(out.y).toBe(0);
    expect(out.z).toBe(0);
    expect(out.w).toBe(1);
  });
});

describe('getMeshGeometryVertexUv0', () => {
  it('reads the uv0 coordinates', () => {
    const geo = makeOneVertex();
    const out = { x: 0, y: 0 };
    expect(getMeshGeometryVertexUv0(out, geo, 0)).toBe(true);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(0.75);
  });
});

describe('getVertexAttribute', () => {
  it('returns the attribute for a present semantic', () => {
    const attr = getVertexAttribute(CANONICAL_LAYOUT, 'normal');
    expect(attr).not.toBeNull();
    expect(attr!.byteOffset).toBe(12);
    expect(attr!.format).toBe('float32x3');
  });
  it('returns null for an absent semantic', () => {
    expect(getVertexAttribute(CANONICAL_LAYOUT, 'color0')).toBeNull();
  });
});

describe('getVertexAttributeFloatOffset', () => {
  it('returns the float offset for a float32 semantic', () => {
    expect(getVertexAttributeFloatOffset(CANONICAL_LAYOUT, 'position')).toBe(0);
    expect(getVertexAttributeFloatOffset(CANONICAL_LAYOUT, 'normal')).toBe(3);
    expect(getVertexAttributeFloatOffset(CANONICAL_LAYOUT, 'tangent')).toBe(6);
    expect(getVertexAttributeFloatOffset(CANONICAL_LAYOUT, 'uv0')).toBe(10);
  });
  it('returns -1 for an absent semantic', () => {
    expect(getVertexAttributeFloatOffset(CANONICAL_LAYOUT, 'color0')).toBe(-1);
  });
  it('returns -1 for a non-float32 attribute', () => {
    const layout: VertexAttributeLayout = {
      attributes: [{ byteOffset: 0, format: 'uint8x4', semantic: 'color0' }],
      stride: 4,
    };
    expect(getVertexAttributeFloatOffset(layout, 'color0')).toBe(-1);
  });
});

describe('setMeshGeometryVertexNormal', () => {
  it('writes the normal and bumps version', () => {
    const geo = makeOneVertex();
    const v0 = geo.version;
    expect(setMeshGeometryVertexNormal(geo, 0, 0, 0, 1)).toBe(true);
    expect(geo.vertices[3]).toBe(0);
    expect(geo.vertices[4]).toBe(0);
    expect(geo.vertices[5]).toBe(1);
    expect(geo.version).toBe(v0 + 1);
  });
  it('returns false for out-of-range index', () => {
    const geo = makeOneVertex();
    expect(setMeshGeometryVertexNormal(geo, 5, 0, 0, 1)).toBe(false);
  });
});

describe('setMeshGeometryVertexPosition', () => {
  it('writes the position and bumps version', () => {
    const geo = makeOneVertex();
    const v0 = geo.version;
    expect(setMeshGeometryVertexPosition(geo, 0, 10, 20, 30)).toBe(true);
    expect(geo.vertices[0]).toBe(10);
    expect(geo.vertices[1]).toBe(20);
    expect(geo.vertices[2]).toBe(30);
    expect(geo.version).toBe(v0 + 1);
  });
});

describe('setMeshGeometryVertexTangent', () => {
  it('writes the tangent including w and bumps version', () => {
    const geo = makeOneVertex();
    const v0 = geo.version;
    expect(setMeshGeometryVertexTangent(geo, 0, 0, 1, 0, -1)).toBe(true);
    expect(geo.vertices[6]).toBe(0);
    expect(geo.vertices[7]).toBe(1);
    expect(geo.vertices[8]).toBe(0);
    expect(geo.vertices[9]).toBe(-1);
    expect(geo.version).toBe(v0 + 1);
  });
});

describe('setMeshGeometryVertexUv0', () => {
  it('writes the uv0 and bumps version', () => {
    const geo = makeOneVertex();
    const v0 = geo.version;
    expect(setMeshGeometryVertexUv0(geo, 0, 0.1, 0.9)).toBe(true);
    expect(geo.vertices[10]).toBeCloseTo(0.1);
    expect(geo.vertices[11]).toBeCloseTo(0.9);
    expect(geo.version).toBe(v0 + 1);
  });
  it('returns false for absent semantic', () => {
    const layout: VertexAttributeLayout = {
      attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
      stride: 12,
    };
    const geo = createMeshGeometry({ layout, vertices: new Float32Array(3) });
    expect(setMeshGeometryVertexUv0(geo, 0, 0.5, 0.5)).toBe(false);
  });
});
