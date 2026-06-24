import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { MeshGeometry } from '@flighthq/types';

import { ensureGlMeshUpload, hasGlMeshGeometryUv1 } from './glMeshUpload';
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

describe('hasGlMeshGeometryUv1', () => {
  it('returns false for geometry without a uv1 semantic', () => {
    const geometry = createBoxMeshGeometry();
    expect(hasGlMeshGeometryUv1(geometry)).toBe(false);
  });

  it('returns true when the geometry layout carries a uv1 semantic', () => {
    const geometry = createBoxMeshGeometry();
    const withUv1: MeshGeometry = {
      ...geometry,
      layout: {
        attributes: [
          ...geometry.layout.attributes,
          { byteOffset: geometry.layout.stride, format: 'float32x2', semantic: 'uv1' },
        ],
        stride: geometry.layout.stride + 8,
      },
    };
    expect(hasGlMeshGeometryUv1(withUv1)).toBe(true);
  });

  it('returns false for geometry with only standard PBR attributes but no uv1', () => {
    const geometry = createBoxMeshGeometry();
    // createBoxMeshGeometry produces position/normal/tangent/uv0 — no uv1.
    const semantics = geometry.layout.attributes.map((a) => a.semantic);
    expect(semantics).not.toContain('uv1');
    expect(hasGlMeshGeometryUv1(geometry)).toBe(false);
  });
});
