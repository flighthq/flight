import { createBoxMeshGeometry, createMeshGeometry } from '@flighthq/mesh';
import type { MeshGeometryRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { ensureWgpuMeshUpload } from './webgpuMeshUpload';
import { getWgpuSceneRuntime } from './webgpuSceneRuntime';
import { makeWgpuSceneState } from './webgpuSceneTestHelper';

describe('ensureWgpuMeshUpload', () => {
  it('uploads vertex + index buffers and caches by geometry', () => {
    const { fake, state } = makeWgpuSceneState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureWgpuMeshUpload(state, geometry);

    expect(upload).not.toBeNull();
    expect(upload!.vertexBuffer).toBeDefined();
    expect(upload!.indexBuffer).toBeDefined();
    expect(upload!.indexCount).toBe(geometry.indices!.length);
    expect(upload!.version).toBe(geometry.version);
    expect(fake.calls.filter((c) => c.name === 'writeBuffer').length).toBeGreaterThanOrEqual(2);
  });

  it('returns the cached upload without re-uploading when version is unchanged', () => {
    const { fake, state } = makeWgpuSceneState();
    const geometry = createBoxMeshGeometry();
    const first = ensureWgpuMeshUpload(state, geometry);
    const writesAfterFirst = fake.calls.filter((c) => c.name === 'writeBuffer').length;
    const second = ensureWgpuMeshUpload(state, geometry);
    expect(second).toBe(first);
    expect(fake.calls.filter((c) => c.name === 'writeBuffer').length).toBe(writesAfterFirst);
  });

  it('re-uploads when geometry.version changes', () => {
    const { state } = makeWgpuSceneState();
    const geometry = createBoxMeshGeometry();
    const first = ensureWgpuMeshUpload(state, geometry);
    geometry.version++;
    const second = ensureWgpuMeshUpload(state, geometry);
    expect(second).not.toBe(first);
    expect(second!.version).toBe(geometry.version);
  });

  it('mirrors the upload onto MeshGeometryRuntime.webgpuData', () => {
    const { state } = makeWgpuSceneState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureWgpuMeshUpload(state, geometry);
    const meshRuntime = geometry[EntityRuntimeKey] as MeshGeometryRuntime;
    expect(meshRuntime.webgpuData as unknown).toBe(upload);
  });

  it('returns null for non-indexed geometry', () => {
    const { state } = makeWgpuSceneState();
    const geometry = createMeshGeometry({
      indices: null,
      layout: {
        attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
        stride: 12,
      },
      vertices: new Float32Array(9),
    });
    expect(ensureWgpuMeshUpload(state, geometry)).toBeNull();
    expect(getWgpuSceneRuntime(state).uploadCache.get(geometry)).toBeUndefined();
  });
});
