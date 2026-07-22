import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import {
  getMeshGeometryVertexColor0,
  getMeshGeometryVertexJoints0,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexTangent,
  getMeshGeometryVertexUv0,
  getMeshGeometryVertexUv1,
  getMeshGeometryVertexWeights0,
  getVertexAttribute,
  getVertexAttributeFloatOffset,
  setMeshGeometryVertexColor0,
  setMeshGeometryVertexJoints0,
  setMeshGeometryVertexNormal,
  setMeshGeometryVertexPosition,
  setMeshGeometryVertexTangent,
  setMeshGeometryVertexUv0,
  setMeshGeometryVertexUv1,
  setMeshGeometryVertexWeights0,
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

function makePackedVertex() {
  const layout: VertexAttributeLayout = {
    attributes: [
      { byteOffset: 0, format: 'float32x2', semantic: 'uv1' },
      { byteOffset: 8, format: 'unorm8x4', semantic: 'color0' },
      { byteOffset: 12, format: 'uint16x4', semantic: 'joints0' },
      { byteOffset: 20, format: 'unorm8x4', semantic: 'weights0' },
    ],
    stride: 24,
  };
  const vertices = new Float32Array(6);
  const view = new DataView(vertices.buffer);
  view.setFloat32(0, 0.25, true);
  view.setFloat32(4, 0.75, true);
  view.setUint8(8, 255);
  view.setUint8(9, 128);
  view.setUint8(10, 0);
  view.setUint8(11, 64);
  view.setUint16(12, 2, true);
  view.setUint16(14, 400, true);
  view.setUint16(16, 65_535, true);
  view.setUint16(18, 0, true);
  view.setUint8(20, 128);
  view.setUint8(21, 64);
  view.setUint8(22, 32);
  view.setUint8(23, 31);
  return createMeshGeometry({ layout, vertices });
}

describe('extended mesh vertex channels', () => {
  it('reads uv1 and decodes packed color, joint, and weight storage', () => {
    const geometry = makePackedVertex();
    const uv = { x: 0, y: 0 };
    const color = { w: 0, x: 0, y: 0, z: 0 };
    const joints = { w: 0, x: 0, y: 0, z: 0 };
    const weights = { w: 0, x: 0, y: 0, z: 0 };

    expect(getMeshGeometryVertexUv1(uv, geometry, 0)).toBe(true);
    expect(getMeshGeometryVertexColor0(color, geometry, 0)).toBe(true);
    expect(getMeshGeometryVertexJoints0(joints, geometry, 0)).toBe(true);
    expect(getMeshGeometryVertexWeights0(weights, geometry, 0)).toBe(true);

    expect(uv).toEqual({ x: 0.25, y: 0.75 });
    expect(color.x).toBe(1);
    expect(color.y).toBeCloseTo(128 / 255);
    expect(color.z).toBe(0);
    expect(color.w).toBeCloseTo(64 / 255);
    expect(joints).toEqual({ w: 0, x: 2, y: 400, z: 65_535 });
    expect(weights.x).toBeCloseTo(128 / 255);
    expect(weights.y).toBeCloseTo(64 / 255);
    expect(weights.z).toBeCloseTo(32 / 255);
    expect(weights.w).toBeCloseTo(31 / 255);
  });

  it('writes float and packed channels with one version bump each', () => {
    const geometry = makePackedVertex();
    const initialVersion = geometry.version;

    expect(setMeshGeometryVertexUv1(geometry, 0, 0.1, 0.9)).toBe(true);
    expect(setMeshGeometryVertexColor0(geometry, 0, 1.2, 0.5, -1, 0.25)).toBe(true);
    expect(setMeshGeometryVertexJoints0(geometry, 0, 3.4, 70_000, -2, 9)).toBe(true);
    expect(setMeshGeometryVertexWeights0(geometry, 0, 0.5, 0.25, 0.125, 0.125)).toBe(true);
    expect(geometry.version).toBe(initialVersion + 4);

    const uv = { x: 0, y: 0 };
    const color = { w: 0, x: 0, y: 0, z: 0 };
    const joints = { w: 0, x: 0, y: 0, z: 0 };
    const weights = { w: 0, x: 0, y: 0, z: 0 };
    getMeshGeometryVertexUv1(uv, geometry, 0);
    getMeshGeometryVertexColor0(color, geometry, 0);
    getMeshGeometryVertexJoints0(joints, geometry, 0);
    getMeshGeometryVertexWeights0(weights, geometry, 0);
    expect(uv.x).toBeCloseTo(0.1);
    expect(uv.y).toBeCloseTo(0.9);
    expect(color.x).toBe(1);
    expect(color.y).toBeCloseTo(128 / 255);
    expect(color.z).toBe(0);
    expect(color.w).toBeCloseTo(64 / 255);
    expect(joints).toEqual({ w: 9, x: 3, y: 65_535, z: 0 });
    expect(weights.x).toBeCloseTo(128 / 255);
    expect(weights.y).toBeCloseTo(64 / 255);
    expect(weights.z).toBeCloseTo(32 / 255);
    expect(weights.w).toBeCloseTo(32 / 255);
  });

  it('leaves output and version untouched for missing or out-of-range channels', () => {
    const geometry = makeOneVertex();
    const out = { w: 4, x: 1, y: 2, z: 3 };
    const version = geometry.version;
    expect(getMeshGeometryVertexColor0(out, geometry, 0)).toBe(false);
    expect(getMeshGeometryVertexJoints0(out, geometry, 5)).toBe(false);
    expect(setMeshGeometryVertexWeights0(geometry, 0, 1, 0, 0, 0)).toBe(false);
    expect(out).toEqual({ w: 4, x: 1, y: 2, z: 3 });
    expect(geometry.version).toBe(version);
  });

  it('treats float32x3 color alpha as the GL implicit default', () => {
    const layout: VertexAttributeLayout = {
      attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'color0' }],
      stride: 12,
    };
    const geometry = createMeshGeometry({ layout, vertices: new Float32Array([0.1, 0.2, 0.3]) });
    const out = { w: 0, x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexColor0(out, geometry, 0)).toBe(true);
    expect(out.w).toBe(1);
    expect(setMeshGeometryVertexColor0(geometry, 0, 0.4, 0.5, 0.6, 0.1)).toBe(true);
    expect(Array.from(geometry.vertices)).toEqual([expect.closeTo(0.4), expect.closeTo(0.5), expect.closeTo(0.6)]);
  });
});

describe('getMeshGeometryVertexColor0', () => {
  it('decodes the declared color storage', () => {
    const out = { w: 0, x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexColor0(out, makePackedVertex(), 0)).toBe(true);
    expect(out.x).toBe(1);
  });
});

describe('getMeshGeometryVertexJoints0', () => {
  it('decodes the declared joint storage', () => {
    const out = { w: 0, x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexJoints0(out, makePackedVertex(), 0)).toBe(true);
    expect(out.y).toBe(400);
  });
});

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

describe('getMeshGeometryVertexUv1', () => {
  it('reads the secondary UV channel', () => {
    const out = { x: 0, y: 0 };
    expect(getMeshGeometryVertexUv1(out, makePackedVertex(), 0)).toBe(true);
    expect(out).toEqual({ x: 0.25, y: 0.75 });
  });
});

describe('getMeshGeometryVertexWeights0', () => {
  it('decodes normalized packed weights', () => {
    const out = { w: 0, x: 0, y: 0, z: 0 };
    expect(getMeshGeometryVertexWeights0(out, makePackedVertex(), 0)).toBe(true);
    expect(out.x).toBeCloseTo(128 / 255);
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

describe('setMeshGeometryVertexColor0', () => {
  it('encodes and versions the declared color storage', () => {
    const geometry = makePackedVertex();
    expect(setMeshGeometryVertexColor0(geometry, 0, 0, 1, 0, 1)).toBe(true);
    expect(geometry.version).toBe(1);
  });
});

describe('setMeshGeometryVertexJoints0', () => {
  it('encodes and versions the declared joint storage', () => {
    const geometry = makePackedVertex();
    expect(setMeshGeometryVertexJoints0(geometry, 0, 1, 2, 3, 4)).toBe(true);
    expect(geometry.version).toBe(1);
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

describe('setMeshGeometryVertexUv1', () => {
  it('writes and versions the secondary UV channel', () => {
    const geometry = makePackedVertex();
    expect(setMeshGeometryVertexUv1(geometry, 0, 0, 1)).toBe(true);
    expect(geometry.version).toBe(1);
  });
});

describe('setMeshGeometryVertexWeights0', () => {
  it('encodes and versions normalized packed weights', () => {
    const geometry = makePackedVertex();
    expect(setMeshGeometryVertexWeights0(geometry, 0, 1, 0, 0, 0)).toBe(true);
    expect(geometry.version).toBe(1);
  });
});
