import { createBoxMeshGeometry, createMeshGeometry } from '@flighthq/mesh/contract';

import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { ensureWgpuWireframeUpload } from './wgpuWireframeUpload';

describe('ensureWgpuWireframeUpload', () => {
  it('builds a line-index buffer sized two indices per triangle edge', () => {
    const { fake, state } = makeWgpuScene3DState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureWgpuWireframeUpload(state, geometry);
    expect(upload).not.toBeNull();
    expect(upload!.lineIndexBuffer).toBeDefined();
    expect(upload!.indexFormat === 'uint16' || upload!.indexFormat === 'uint32').toBe(true);

    // An INDEX buffer is created sized for the derived line list (6 indices per triangle).
    const triangleCount = geometry.indices!.length / 3;
    const bytesPerIndex = upload!.indexFormat === 'uint32' ? 4 : 2;
    const lineBufferCreate = fake.calls.find(
      (c) =>
        c.name === 'createBuffer' &&
        ((c.args[0] as { usage: number; size: number }).usage & GPUBufferUsage.INDEX) !== 0 &&
        (c.args[0] as { size: number }).size === triangleCount * 6 * bytesPerIndex,
    );
    expect(lineBufferCreate).toBeDefined();
  });

  // Non-indexed geometry only became reachable here once the mesh upload stopped refusing it; before
  // that this function bailed early, and buildLineIndices would have dereferenced a null index array.
  // The edges come from a sequential vertex range instead, matching glWireframeUpload.
  it('derives line indices from a sequential range for non-indexed geometry', () => {
    const { fake, state } = makeWgpuScene3DState();
    // Two triangles' worth of positions: 6 vertices x 3 floats.
    const geometry = createMeshGeometry({
      indices: null,
      layout: {
        attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
        stride: 12,
      },
      vertices: new Float32Array(18),
    });

    const upload = ensureWgpuWireframeUpload(state, geometry);

    expect(upload).not.toBeNull();
    // 2 triangles x 6 line indices x 2 bytes.
    const lineBufferCreate = fake.calls.find(
      (c) =>
        c.name === 'createBuffer' &&
        ((c.args[0] as { usage: number }).usage & GPUBufferUsage.INDEX) !== 0 &&
        (c.args[0] as { size: number }).size === 2 * 6 * 2,
    );
    expect(lineBufferCreate).toBeDefined();
  });

  it('returns the cached upload without rebuilding when the version is unchanged', () => {
    const { fake, state } = makeWgpuScene3DState();
    const geometry = createBoxMeshGeometry();
    const first = ensureWgpuWireframeUpload(state, geometry);
    const buffers = fake.calls.filter((c) => c.name === 'createBuffer').length;
    const second = ensureWgpuWireframeUpload(state, geometry);
    expect(second).toBe(first);
    expect(fake.calls.filter((c) => c.name === 'createBuffer').length).toBe(buffers);
  });
});
