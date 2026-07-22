import type { VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import {
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  convertMeshGeometryLayout,
} from './meshGeometryLayout';

// Minimal position-only layout: 3 floats / 12 bytes.
const POSITION_ONLY_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

// position + uv0 layout: 5 floats / 20 bytes.
const POSITION_UV0_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 20,
};

function makeCanonicalGeometry() {
  const vertices = new Float32Array(12); // one vertex, canonical layout
  // position = (1, 2, 3), normal = (0, 1, 0), tangent = (1, 0, 0, 1), uv0 = (0.5, 0.25)
  vertices[0] = 1;
  vertices[1] = 2;
  vertices[2] = 3;
  vertices[3] = 0;
  vertices[4] = 1;
  vertices[5] = 0;
  vertices[6] = 1;
  vertices[7] = 0;
  vertices[8] = 0;
  vertices[9] = 1;
  vertices[10] = 0.5;
  vertices[11] = 0.25;
  return createMeshGeometry({ layout: CANONICAL_MESH_GEOMETRY_LAYOUT, vertices: vertices });
}

describe('CANONICAL_MESH_GEOMETRY_LAYOUT', () => {
  it('has stride 48', () => {
    expect(CANONICAL_MESH_GEOMETRY_LAYOUT.stride).toBe(48);
  });
  it('has four attributes: position, normal, tangent, uv0', () => {
    const semantics = CANONICAL_MESH_GEOMETRY_LAYOUT.attributes.map((a) => a.semantic);
    expect(semantics).toContain('position');
    expect(semantics).toContain('normal');
    expect(semantics).toContain('tangent');
    expect(semantics).toContain('uv0');
  });
  it('position attribute is at byteOffset 0 with format float32x3', () => {
    const pos = CANONICAL_MESH_GEOMETRY_LAYOUT.attributes.find((a) => a.semantic === 'position');
    expect(pos?.byteOffset).toBe(0);
    expect(pos?.format).toBe('float32x3');
  });
});

describe('CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT', () => {
  it('extends the canonical PBR record to stride 80', () => {
    expect(CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.stride).toBe(80);
  });
  it('keeps position and normal at the canonical offsets so rigid compute still works', () => {
    const attributes = CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.attributes;
    const position = attributes.find((a) => a.semantic === 'position');
    const normal = attributes.find((a) => a.semantic === 'normal');
    expect(position?.byteOffset).toBe(0);
    expect(normal?.byteOffset).toBe(12);
  });
  it('adds joints0 and weights0 as float32x4 after uv0', () => {
    const attributes = CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.attributes;
    const joints = attributes.find((a) => a.semantic === 'joints0');
    const weights = attributes.find((a) => a.semantic === 'weights0');
    expect(joints?.byteOffset).toBe(48);
    expect(joints?.format).toBe('float32x4');
    expect(weights?.byteOffset).toBe(64);
    expect(weights?.format).toBe('float32x4');
  });
});

describe('convertMeshGeometryLayout', () => {
  it('strips to position-only layout', () => {
    const source = makeCanonicalGeometry();
    const converted = convertMeshGeometryLayout(source, POSITION_ONLY_LAYOUT);
    expect(converted.layout.stride).toBe(12);
    expect(converted.vertices.length).toBe(3);
    expect(converted.vertices[0]).toBeCloseTo(1);
    expect(converted.vertices[1]).toBeCloseTo(2);
    expect(converted.vertices[2]).toBeCloseTo(3);
  });
  it('strips to position + uv0 layout', () => {
    const source = makeCanonicalGeometry();
    const converted = convertMeshGeometryLayout(source, POSITION_UV0_LAYOUT);
    expect(converted.layout.stride).toBe(20);
    expect(converted.vertices.length).toBe(5);
    expect(converted.vertices[0]).toBeCloseTo(1);
    expect(converted.vertices[1]).toBeCloseTo(2);
    expect(converted.vertices[2]).toBeCloseTo(3);
    expect(converted.vertices[3]).toBeCloseTo(0.5);
    expect(converted.vertices[4]).toBeCloseTo(0.25);
  });
  it('zero-fills attributes absent in the source', () => {
    // Source has position only; target requests position + normal.
    const posOnlySource = createMeshGeometry({
      layout: POSITION_ONLY_LAYOUT,
      vertices: new Float32Array([1, 2, 3]),
    });
    const targetLayout: VertexAttributeLayout = {
      attributes: [
        { byteOffset: 0, format: 'float32x3', semantic: 'position' },
        { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
      ],
      stride: 24,
    };
    const converted = convertMeshGeometryLayout(posOnlySource, targetLayout);
    expect(converted.vertices[0]).toBeCloseTo(1);
    expect(converted.vertices[1]).toBeCloseTo(2);
    expect(converted.vertices[2]).toBeCloseTo(3);
    // Normal was not in source → zero-filled.
    expect(converted.vertices[3]).toBe(0);
    expect(converted.vertices[4]).toBe(0);
    expect(converted.vertices[5]).toBe(0);
  });
  it('converts packed channels by semantic and round-trips their declared encoding', () => {
    const packedLayout: VertexAttributeLayout = {
      attributes: [
        { byteOffset: 0, format: 'unorm8x4', semantic: 'color0' },
        { byteOffset: 4, format: 'uint16x4', semantic: 'joints0' },
      ],
      stride: 12,
    };
    const packedVertices = new Float32Array(3);
    const packedView = new DataView(packedVertices.buffer);
    new Uint8Array(packedVertices.buffer).set([255, 128, 0, 64]);
    packedView.setUint16(4, 1, true);
    packedView.setUint16(6, 255, true);
    packedView.setUint16(8, 256, true);
    packedView.setUint16(10, 65_535, true);
    const source = createMeshGeometry({ layout: packedLayout, vertices: packedVertices });
    const floatLayout: VertexAttributeLayout = {
      attributes: [
        { byteOffset: 0, format: 'float32x4', semantic: 'color0' },
        { byteOffset: 16, format: 'float32x4', semantic: 'joints0' },
      ],
      stride: 32,
    };

    const converted = convertMeshGeometryLayout(source, floatLayout);

    expect(converted.vertices[0]).toBe(1);
    expect(converted.vertices[1]).toBeCloseTo(128 / 255);
    expect(converted.vertices[2]).toBe(0);
    expect(converted.vertices[3]).toBeCloseTo(64 / 255);
    expect(Array.from(converted.vertices.slice(4, 8))).toEqual([1, 255, 256, 65_535]);
    const roundTrip = convertMeshGeometryLayout(converted, packedLayout);
    expect(Array.from(new Uint8Array(roundTrip.vertices.buffer))).toEqual(
      Array.from(new Uint8Array(packedVertices.buffer)),
    );
  });
  it('leaves target-only components zero instead of reading into the next source attribute', () => {
    const sourceLayout: VertexAttributeLayout = {
      attributes: [
        { byteOffset: 0, format: 'float32x3', semantic: 'position' },
        { byteOffset: 12, format: 'unorm8x4', semantic: 'color0' },
      ],
      stride: 16,
    };
    const sourceVertices = new Float32Array([1, 2, 3, 123]);
    const source = createMeshGeometry({ layout: sourceLayout, vertices: sourceVertices });
    const targetLayout: VertexAttributeLayout = {
      attributes: [{ byteOffset: 0, format: 'float32x4', semantic: 'position' }],
      stride: 16,
    };

    const converted = convertMeshGeometryLayout(source, targetLayout);

    expect(Array.from(converted.vertices)).toEqual([1, 2, 3, 0]);
  });
  it('preserves vertex count', () => {
    const vertices = new Float32Array(3 * 12); // 3 canonical vertices
    vertices[0] = 1;
    vertices[12] = 2;
    vertices[24] = 3;
    const source = createMeshGeometry({ layout: CANONICAL_MESH_GEOMETRY_LAYOUT, vertices: vertices });
    const converted = convertMeshGeometryLayout(source, POSITION_ONLY_LAYOUT);
    expect(converted.vertices.length).toBe(9); // 3 vertices × 3 floats
    expect(converted.vertices[0]).toBeCloseTo(1);
    expect(converted.vertices[3]).toBeCloseTo(2);
    expect(converted.vertices[6]).toBeCloseTo(3);
  });
  it('preserves index buffer and topology', () => {
    const vertices = new Float32Array(3 * 12);
    const indices = new Uint16Array([0, 1, 2]);
    const source = createMeshGeometry({
      indices: indices,
      layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
      topology: 'triangle-list',
      vertices: vertices,
    });
    const converted = convertMeshGeometryLayout(source, POSITION_ONLY_LAYOUT);
    expect(converted.topology).toBe('triangle-list');
    expect(converted.indices).not.toBeNull();
    expect(converted.indices?.length).toBe(3);
  });
  it('does not modify the source geometry', () => {
    const source = makeCanonicalGeometry();
    const originalData = Array.from(source.vertices);
    convertMeshGeometryLayout(source, POSITION_ONLY_LAYOUT);
    expect(Array.from(source.vertices)).toEqual(originalData);
  });
});
