import { createBoxMeshGeometry } from '@flighthq/mesh';

import { makeWgpuSceneState } from './wgpuSceneTestHelper';
import { ensureWgpuWireframeUpload } from './wgpuWireframeUpload';

describe('ensureWgpuWireframeUpload', () => {
  it('builds a line-index buffer sized two indices per triangle edge', () => {
    const { fake, state } = makeWgpuSceneState();
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

  it('returns the cached upload without rebuilding when the version is unchanged', () => {
    const { fake, state } = makeWgpuSceneState();
    const geometry = createBoxMeshGeometry();
    const first = ensureWgpuWireframeUpload(state, geometry);
    const buffers = fake.calls.filter((c) => c.name === 'createBuffer').length;
    const second = ensureWgpuWireframeUpload(state, geometry);
    expect(second).toBe(first);
    expect(fake.calls.filter((c) => c.name === 'createBuffer').length).toBe(buffers);
  });
});
