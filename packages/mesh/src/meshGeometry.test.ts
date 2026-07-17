import type { MeshGeometryRuntime, MeshSkinBindPose, VertexAttributeLayout } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import {
  cloneMeshGeometry,
  createMeshGeometry,
  destroyMeshGeometryGlData,
  destroyMeshGeometryWgpuData,
  getMeshGeometryIndexCount,
  getMeshGeometrySkinBindPose,
  getMeshGeometryVertexCount,
  hasMeshGeometrySkin,
  setMeshGeometrySkinBindPose,
} from './meshGeometry';

const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

function makeVertices(count: number): Float32Array<ArrayBuffer> {
  return new Float32Array(count * 12);
}

describe('cloneMeshGeometry', () => {
  it('deep-copies vertices and indices independently', () => {
    const vertices = makeVertices(3);
    vertices[0] = 7;
    const indices = new Uint16Array([0, 1, 2]);
    const source = createMeshGeometry({ indices: indices, layout: CANONICAL_LAYOUT, vertices: vertices });

    const clone = cloneMeshGeometry(source);
    expect(clone).not.toBe(source);
    expect(clone.vertices).not.toBe(source.vertices);
    expect(clone.vertices[0]).toBe(7);
    expect(clone.indices).not.toBe(source.indices);

    clone.vertices[0] = 99;
    expect(source.vertices[0]).toBe(7);
  });

  it('resets the upload version and carries a fresh runtime', () => {
    const source = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(1) });
    source.version = 5;
    const clone = cloneMeshGeometry(source);
    expect(clone.version).toBe(0);
    expect(clone[EntityRuntimeKey]).not.toBe(source[EntityRuntimeKey]);
  });

  it('clones bounds when present without sharing the AABB instance', () => {
    const source = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(1) });
    source.bounds = { max: { x: 1, y: 1, z: 1 }, min: { x: -1, y: -1, z: -1 } } as NonNullable<typeof source.bounds>;
    const clone = cloneMeshGeometry(source);
    expect(clone.bounds).not.toBe(source.bounds);
    expect(clone.bounds!.min.x).toBe(-1);
    expect(clone.bounds!.max.z).toBe(1);
  });
});

describe('createMeshGeometry', () => {
  it('defaults topology to triangle-list and a single full subset', () => {
    const indices = new Uint16Array([0, 1, 2]);
    const geometry = createMeshGeometry({ indices: indices, layout: CANONICAL_LAYOUT, vertices: makeVertices(3) });
    expect(geometry.topology).toBe('triangle-list');
    expect(geometry.subsets).toHaveLength(1);
    expect(geometry.subsets[0]).toEqual({ indexCount: 3, indexOffset: 0 });
  });

  it('keeps Uint16 indices below the 65k ceiling', () => {
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2]),
      layout: CANONICAL_LAYOUT,
      vertices: makeVertices(3),
    });
    expect(geometry.indices).toBeInstanceOf(Uint16Array);
  });

  it('auto-promotes indices to Uint32 past 65535 vertices', () => {
    const vertexCount = 70000;
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2]),
      layout: CANONICAL_LAYOUT,
      vertices: makeVertices(vertexCount),
    });
    expect(geometry.indices).toBeInstanceOf(Uint32Array);
    expect(getMeshGeometryVertexCount(geometry)).toBe(vertexCount);
  });

  it('keeps already-Uint32 indices as Uint32', () => {
    const geometry = createMeshGeometry({
      indices: new Uint32Array([0, 1, 2]),
      layout: CANONICAL_LAYOUT,
      vertices: makeVertices(3),
    });
    expect(geometry.indices).toBeInstanceOf(Uint32Array);
  });

  it('allows non-indexed geometry with a vertex-count subset', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(6) });
    expect(geometry.indices).toBeNull();
    expect(geometry.subsets[0].indexCount).toBe(6);
  });

  it('initializes null GPU upload slots on the runtime', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(1) });
    const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime;
    expect(runtime.webglData).toBeNull();
    expect(runtime.webgpuData).toBeNull();
  });
});

describe('destroyMeshGeometryGlData', () => {
  it('clears the webgl upload slot', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(1) });
    const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime;
    runtime.webglData = {} as MeshGeometryRuntime['webglData'];
    destroyMeshGeometryGlData(geometry);
    expect(runtime.webglData).toBeNull();
  });
});

describe('destroyMeshGeometryWgpuData', () => {
  it('clears the webgpu upload slot', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(1) });
    const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime;
    runtime.webgpuData = {} as MeshGeometryRuntime['webgpuData'];
    destroyMeshGeometryWgpuData(geometry);
    expect(runtime.webgpuData).toBeNull();
  });
});

describe('getMeshGeometryIndexCount', () => {
  it('returns the index length', () => {
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      layout: CANONICAL_LAYOUT,
      vertices: makeVertices(4),
    });
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('returns 0 for non-indexed geometry', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(3) });
    expect(getMeshGeometryIndexCount(geometry)).toBe(0);
  });
});

describe('getMeshGeometrySkinBindPose', () => {
  it('returns null before any capture', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(3) });
    expect(getMeshGeometrySkinBindPose(geometry)).toBeNull();
  });
});

describe('getMeshGeometryVertexCount', () => {
  it('derives the vertex count from stride', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(5) });
    expect(getMeshGeometryVertexCount(geometry)).toBe(5);
  });
});

describe('hasMeshGeometrySkin', () => {
  it('is false for the canonical (rigid) layout and true when joints0 is present', () => {
    const rigid = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(3) });
    expect(hasMeshGeometrySkin(rigid)).toBe(false);

    const skinnedLayout: VertexAttributeLayout = {
      attributes: [
        { byteOffset: 0, format: 'float32x3', semantic: 'position' },
        { byteOffset: 12, format: 'float32x4', semantic: 'joints0' },
        { byteOffset: 28, format: 'float32x4', semantic: 'weights0' },
      ],
      stride: 44,
    };
    const skinned = createMeshGeometry({ layout: skinnedLayout, vertices: new Float32Array(11) });
    expect(hasMeshGeometrySkin(skinned)).toBe(true);
  });
});

describe('setMeshGeometrySkinBindPose', () => {
  it('stores and clears the skinning bind pose on the runtime slot', () => {
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: makeVertices(3) });
    const bindPose: MeshSkinBindPose = {
      joints: new Float32Array(4),
      normals: new Float32Array(3),
      positions: new Float32Array(3),
      skinnedNormals: new Float32Array(3),
      skinnedPositions: new Float32Array(3),
      weights: new Float32Array(4),
    };

    setMeshGeometrySkinBindPose(geometry, bindPose);
    expect(getMeshGeometrySkinBindPose(geometry)).toBe(bindPose);

    setMeshGeometrySkinBindPose(geometry, null);
    expect(getMeshGeometrySkinBindPose(geometry)).toBeNull();
  });
});
