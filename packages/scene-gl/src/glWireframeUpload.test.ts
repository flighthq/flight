import { createBoxMeshGeometry } from '@flighthq/mesh';

import { makeGlSceneState } from './glSceneTestHelper';
import { ensureGlWireframeUpload } from './glWireframeUpload';

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
