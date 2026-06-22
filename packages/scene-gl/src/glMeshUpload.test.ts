import { createBoxMeshGeometry } from '@flighthq/mesh';

import { ensureGlMeshUpload } from './glMeshUpload';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';

describe('ensureGlMeshUpload', () => {
  it('uploads vertex + index buffers into a VAO and reports the indexed draw shape', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureGlMeshUpload(state, geometry);

    expect(upload.vao).not.toBeNull();
    expect(upload.vertexBuffer).not.toBeNull();
    expect(upload.indexBuffer).not.toBeNull();
    expect(upload.indexCount).toBe(geometry.indices!.length);
    const expectedType = geometry.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    expect(upload.indexType).toBe(expectedType);
    expect(upload.version).toBe(geometry.version);
    expect(gl.calls.some((c) => c.name === 'bufferData')).toBe(true);
  });

  it('caches by geometry and reuses the upload when the version is unchanged', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const first = ensureGlMeshUpload(state, geometry);
    const bufferDataCount = gl.calls.filter((c) => c.name === 'bufferData').length;
    const second = ensureGlMeshUpload(state, geometry);
    expect(second).toBe(first);
    // No re-upload: bufferData not called again, only the VAO re-bound.
    expect(gl.calls.filter((c) => c.name === 'bufferData').length).toBe(bufferDataCount);
    expect(getGlSceneRuntime(state).uploadCache.get(geometry)).toBe(first);
  });

  it('re-uploads when the geometry version is bumped, reusing the GL objects', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const first = ensureGlMeshUpload(state, geometry);
    geometry.version++;
    const bufferDataCount = gl.calls.filter((c) => c.name === 'bufferData').length;
    const second = ensureGlMeshUpload(state, geometry);
    expect(second).toBe(first);
    expect(second.vao).toBe(first.vao);
    expect(gl.calls.filter((c) => c.name === 'bufferData').length).toBeGreaterThan(bufferDataCount);
    expect(second.version).toBe(geometry.version);
  });
});
