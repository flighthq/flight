import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  createBoxMeshGeometry,
  createMeshGeometry,
  invalidateMeshGeometry,
  setMeshGeometrySkinBindPose,
  updateMeshMorph,
} from '@flighthq/mesh/contract';
import { createMesh } from '@flighthq/scene3d/contract';
import type { MeshGeometryRuntime, MeshMorph, VertexAttributeLayout } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { ensureWgpuMeshUpload } from './wgpuMeshUpload';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { registerWgpuGpuSkinning } from './wgpuSkinPalette';

const POSITION_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

function lastUploadedVertices(calls: readonly { name: string; args: readonly unknown[] }[]): Float32Array {
  const writes = calls.filter((call) => call.name === 'writeBuffer');
  const write = writes[writes.length - 2]!;
  return new Float32Array(
    write.args[2] as ArrayBuffer,
    write.args[3] as number,
    (write.args[4] as number) / Float32Array.BYTES_PER_ELEMENT,
  );
}

describe('ensureWgpuMeshUpload', () => {
  it('uploads vertex + index buffers and caches by geometry', () => {
    const { fake, state } = makeWgpuScene3DState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureWgpuMeshUpload(state, geometry);

    expect(upload).not.toBeNull();
    expect(upload!.vertexBuffer).toBeDefined();
    expect(upload!.indexBuffer).toBeDefined();
    expect(upload!.indexCount).toBe(geometry.indices!.length);
    expect(upload!.version).toBe(geometry.version);
    expect(fake.calls.filter((c) => c.name === 'writeBuffer').length).toBeGreaterThanOrEqual(2);
  });

  it('pads an odd-length Uint16 index upload to four-byte alignment without changing the index count', () => {
    const { fake, state } = makeWgpuScene3DState();
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 1, 2]),
      layout: POSITION_LAYOUT,
      vertices: new Float32Array(9),
    });

    const upload = ensureWgpuMeshUpload(state, geometry);
    const writes = fake.calls.filter((call) => call.name === 'writeBuffer');
    const indexWrite = writes[writes.length - 1]!;
    const uploadedIndices = new Uint16Array(
      indexWrite.args[2] as ArrayBuffer,
      indexWrite.args[3] as number,
      (indexWrite.args[4] as number) / Uint16Array.BYTES_PER_ELEMENT,
    );

    expect(indexWrite.args[4]).toBe(8);
    expect(Array.from(uploadedIndices.subarray(0, 3))).toEqual([0, 1, 2]);
    expect(upload.indexCount).toBe(3);
  });

  it('returns the cached upload without re-uploading when version is unchanged', () => {
    const { fake, state } = makeWgpuScene3DState();
    const geometry = createBoxMeshGeometry();
    const first = ensureWgpuMeshUpload(state, geometry);
    const writesAfterFirst = fake.calls.filter((c) => c.name === 'writeBuffer').length;
    const second = ensureWgpuMeshUpload(state, geometry);
    expect(second).toBe(first);
    expect(fake.calls.filter((c) => c.name === 'writeBuffer').length).toBe(writesAfterFirst);
  });

  it('re-uploads after direct geometry edits are invalidated', () => {
    const { state } = makeWgpuScene3DState();
    const geometry = createBoxMeshGeometry();
    const first = ensureWgpuMeshUpload(state, geometry);
    invalidateMeshGeometry(geometry);
    const second = ensureWgpuMeshUpload(state, geometry);
    expect(second).not.toBe(first);
    expect(second!.version).toBe(geometry.version);
  });

  it('uploads captured bind-pose positions for a GPU-skinned geometry', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuGpuSkinning(state);
    const vertices = new Float32Array(20);
    vertices[0] = 9;
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 0, 0]),
      layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
      vertices,
    });
    setMeshGeometrySkinBindPose(geometry, {
      joints: new Float32Array([0, 0, 0, 0]),
      normals: new Float32Array([0, 1, 0]),
      positions: new Float32Array([1, 2, 3]),
      skinnedNormals: new Float32Array(3),
      skinnedPositions: new Float32Array(3),
      skinnedTangents: new Float32Array(0),
      tangents: new Float32Array(0),
      weights: new Float32Array([1, 0, 0, 0]),
    });

    const upload = ensureWgpuMeshUpload(state, geometry, true);
    const write = fake.calls.find((call) => call.name === 'writeBuffer')!;
    const uploadedVertices = new Float32Array(
      write.args[2] as ArrayBuffer,
      write.args[3] as number,
      (write.args[4] as number) / 4,
    );

    expect(upload?.skinBindUploaded).toBe(true);
    expect(Array.from(uploadedVertices.slice(0, 3))).toEqual([1, 2, 3]);
    expect(geometry.vertices[0]).toBe(9);
  });

  it('re-uploads morph-blended vertices as weights change', () => {
    const { fake, state } = makeWgpuScene3DState();
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 0, 0]),
      layout: POSITION_LAYOUT,
      vertices: new Float32Array([0, 0, 0]),
    });
    const morph: MeshMorph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([4, 0, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    const mesh = createMesh(geometry, []);
    mesh.morph = morph;

    updateMeshMorph(mesh);
    ensureWgpuMeshUpload(state, geometry);
    expect(lastUploadedVertices(fake.calls)[0]).toBeCloseTo(4);

    morph.weights[0] = 0.5;
    updateMeshMorph(mesh);
    ensureWgpuMeshUpload(state, geometry);
    expect(lastUploadedVertices(fake.calls)[0]).toBeCloseTo(2);
  });

  it('uploads current morphed vertices instead of a frozen skin bind pose for GPU skinning', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuGpuSkinning(state);
    const geometry = createMeshGeometry({
      indices: new Uint16Array([0, 0, 0]),
      layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
      vertices: new Float32Array(20),
    });
    geometry.vertices[0] = 1;
    setMeshGeometrySkinBindPose(geometry, {
      joints: new Float32Array([0, 0, 0, 0]),
      normals: new Float32Array([0, 1, 0]),
      positions: new Float32Array([1, 0, 0]),
      skinnedNormals: new Float32Array(3),
      skinnedPositions: new Float32Array(3),
      skinnedTangents: new Float32Array(0),
      tangents: new Float32Array(0),
      weights: new Float32Array([1, 0, 0, 0]),
    });
    const morph: MeshMorph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([4, 0, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    const mesh = createMesh(geometry, []);
    mesh.morph = morph;

    updateMeshMorph(mesh);
    ensureWgpuMeshUpload(state, geometry, true);
    expect(lastUploadedVertices(fake.calls)[0]).toBeCloseTo(5);

    morph.weights[0] = 2;
    updateMeshMorph(mesh);
    ensureWgpuMeshUpload(state, geometry, true);
    expect(lastUploadedVertices(fake.calls)[0]).toBeCloseTo(9);
  });

  it('mirrors the upload onto MeshGeometryRuntime.webgpuData', () => {
    const { state } = makeWgpuScene3DState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureWgpuMeshUpload(state, geometry);
    const meshRuntime = geometry[EntityRuntimeKey] as MeshGeometryRuntime;
    expect(meshRuntime.webgpuData as unknown).toBe(upload);
  });

  // glTF primitives may legitimately omit indices and the importer preserves that, so refusing to
  // upload them made valid meshes vanish on this backend with nothing rendered and nothing thrown.
  // The GL sibling has always uploaded them; this mirrors it.
  it('uploads non-indexed geometry with the vertex count in indexCount', () => {
    const { state } = makeWgpuScene3DState();
    const geometry = createMeshGeometry({
      indices: null,
      layout: {
        attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
        stride: 12,
      },
      vertices: new Float32Array(9),
    });

    const upload = ensureWgpuMeshUpload(state, geometry);

    expect(upload.vertexBuffer).toBeDefined();
    expect(upload.indexBuffer).toBeNull();
    // 9 floats / 3 per vertex = 3 vertices, the count a non-indexed draw needs.
    expect(upload.indexCount).toBe(3);
    expect(getWgpuScene3DRuntime(state).uploadCache.get(geometry)).toBe(upload);
  });

  // No index buffer exists, so no element format describes one. Null says that; a stand-in 'uint16'
  // would read as a fact about a buffer that is not there.
  it('reports a null index format for non-indexed geometry', () => {
    const { state } = makeWgpuScene3DState();
    const geometry = createMeshGeometry({
      indices: null,
      layout: {
        attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
        stride: 12,
      },
      vertices: new Float32Array(9),
    });

    expect(ensureWgpuMeshUpload(state, geometry).indexFormat).toBeNull();
  });

  it('reports zero vertices when the layout has no stride to divide by', () => {
    const { state } = makeWgpuScene3DState();
    const geometry = createMeshGeometry({
      indices: null,
      layout: { attributes: [], stride: 0 },
      vertices: new Float32Array(9),
    });

    expect(ensureWgpuMeshUpload(state, geometry).indexCount).toBe(0);
  });
});
