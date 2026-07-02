import { createBoxMeshGeometry } from '@flighthq/mesh';

import { makeGlSceneState } from './glSceneTestHelper';
import { destroyGlWireframeUpload, ensureGlWireframeUpload } from './glWireframeUpload';

describe('destroyGlWireframeUpload', () => {
  it('deletes the VAO and the line-index buffer, but not the shared vertex buffer', () => {
    const { state, gl } = makeGlSceneState();
    const upload = ensureGlWireframeUpload(state, createBoxMeshGeometry());
    const deletesBefore = gl.calls.filter((c) => c.name === 'deleteBuffer').length;
    destroyGlWireframeUpload(state, upload);
    // Exactly the line-index buffer is freed here; the interleaved vertex buffer belongs to the
    // triangle mesh upload and is freed by destroyGlMeshUpload for that geometry.
    expect(gl.calls.filter((c) => c.name === 'deleteBuffer').length).toBe(deletesBefore + 1);
    expect(gl.calls.filter((c) => c.name === 'deleteVertexArray').length).toBe(1);
    const deletedBuffer = gl.calls.find((c) => c.name === 'deleteBuffer');
    expect(deletedBuffer!.args[0]).toBe(upload.lineIndexBuffer);
  });
});

describe('ensureGlWireframeUpload', () => {
  it('builds a line-index VAO and uploads the derived line buffer', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureGlWireframeUpload(state, geometry);
    expect(upload.vao).toBeDefined();
    expect(upload.lineIndexBuffer).toBeDefined();
    // The element-array upload holds the derived line list: two indices per triangle edge, six per
    // triangle (independent of the Uint16/Uint32 index width).
    const triangleCount = geometry.indices!.length / 3;
    const lineUpload = gl.calls.find(
      (c) =>
        c.name === 'bufferData' &&
        c.args[0] === gl.ELEMENT_ARRAY_BUFFER &&
        ArrayBuffer.isView(c.args[1] as ArrayBufferView) &&
        (c.args[1] as Uint16Array | Uint32Array).length === triangleCount * 6,
    );
    expect(lineUpload).toBeDefined();
  });

  it('re-binds the cached VAO without rebuilding when the version is unchanged', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const first = ensureGlWireframeUpload(state, geometry);
    const builds = gl.calls.filter((c) => c.name === 'createVertexArray').length;
    const second = ensureGlWireframeUpload(state, geometry);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'createVertexArray').length).toBe(builds);
  });
});
