import { createBoxMeshGeometry, setMeshGeometrySkinBindPose } from '@flighthq/mesh';
import type { MeshSkinBindPose } from '@flighthq/types';

import { destroyGlMeshUpload, ensureGlMeshUpload, hasGlMeshGeometryUv1 } from './glMeshUpload';
import type { GlMeshUpload } from './glSceneRuntime';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';

describe('destroyGlMeshUpload', () => {
  it('deletes the VAO and the vertex + index buffers of an indexed upload', () => {
    const { state, gl } = makeGlSceneState();
    const upload = ensureGlMeshUpload(state, createBoxMeshGeometry());
    destroyGlMeshUpload(state, upload);
    expect(gl.calls.filter((c) => c.name === 'deleteVertexArray').length).toBe(1);
    expect(gl.calls.filter((c) => c.name === 'deleteBuffer').length).toBe(2);
  });

  it('skips the index buffer when the upload is non-indexed', () => {
    const { state, gl } = makeGlSceneState();
    const upload: GlMeshUpload = {
      indexBuffer: null,
      indexCount: 0,
      indexType: gl.UNSIGNED_SHORT,
      vao: {} as WebGLVertexArrayObject,
      version: 0,
      vertexBuffer: {} as WebGLBuffer,
    };
    destroyGlMeshUpload(state, upload);
    expect(gl.calls.filter((c) => c.name === 'deleteVertexArray').length).toBe(1);
    expect(gl.calls.filter((c) => c.name === 'deleteBuffer').length).toBe(1);
  });
});

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

  // The double-skinning fix: a GPU-skinned draw must upload the STATIC bind pose, not the CPU-posed
  // geometry.vertices updateMeshSkin writes each frame — else the shader would skin an already-skinned
  // vertex (M²). Captures the box's original positions as the bind pose, then displaces every vertex to
  // simulate a CPU pose and asserts the uploaded buffer carries the bind position, not the displaced one.
  it('uploads the skin bind pose (not the CPU-posed vertices) for a GPU-skinned draw', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry(2, 2, 2);
    const floatsPerVertex = geometry.layout.stride / 4;
    const vertexCount = geometry.vertices.length / floatsPerVertex;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v++) {
      const b = v * floatsPerVertex;
      positions[v * 3] = geometry.vertices[b]!;
      positions[v * 3 + 1] = geometry.vertices[b + 1]!;
      positions[v * 3 + 2] = geometry.vertices[b + 2]!;
      normals[v * 3] = geometry.vertices[b + 3]!;
      normals[v * 3 + 1] = geometry.vertices[b + 4]!;
      normals[v * 3 + 2] = geometry.vertices[b + 5]!;
    }
    const bindPose: MeshSkinBindPose = {
      joints: new Float32Array(0),
      normals,
      positions,
      skinnedNormals: new Float32Array(0),
      skinnedPositions: new Float32Array(0),
      weights: new Float32Array(0),
    };
    setMeshGeometrySkinBindPose(geometry, bindPose);
    // Simulate updateMeshSkin having posed the vertices: shift every position by +1000.
    for (let b = 0; b < geometry.vertices.length; b += floatsPerVertex) geometry.vertices[b] += 1000;
    geometry.version++;

    ensureGlMeshUpload(state, geometry, true);
    const uploaded = gl.calls
      .filter((c) => c.name === 'bufferData')
      .map((c) => c.args[1])
      .find((data): data is Float32Array => data instanceof Float32Array)!;
    // Vertex 0's uploaded position.x is the bind value, not the +1000 CPU-posed value.
    expect(uploaded[0]).toBeCloseTo(positions[0]!);
    expect(uploaded[0]).not.toBeCloseTo(positions[0]! + 1000);
  });

  it('reuses the bind-pose upload across version bumps for a GPU-skinned draw (no per-frame re-skin)', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry(2, 2, 2);
    const floatsPerVertex = geometry.layout.stride / 4;
    const vertexCount = geometry.vertices.length / floatsPerVertex;
    const positions = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v++) {
      const b = v * floatsPerVertex;
      positions[v * 3] = geometry.vertices[b]!;
      positions[v * 3 + 1] = geometry.vertices[b + 1]!;
      positions[v * 3 + 2] = geometry.vertices[b + 2]!;
    }
    setMeshGeometrySkinBindPose(geometry, {
      joints: new Float32Array(0),
      normals: new Float32Array(vertexCount * 3),
      positions,
      skinnedNormals: new Float32Array(0),
      skinnedPositions: new Float32Array(0),
      weights: new Float32Array(0),
    });
    ensureGlMeshUpload(state, geometry, true);
    const afterFirst = gl.calls.filter((c) => c.name === 'bufferData').length;
    geometry.version++; // a per-frame updateMeshSkin bump
    ensureGlMeshUpload(state, geometry, true);
    // The static bind buffer is not re-uploaded on the version bump.
    expect(gl.calls.filter((c) => c.name === 'bufferData').length).toBe(afterFirst);
  });
});

describe('hasGlMeshGeometryUv1', () => {
  it('returns false for geometry without a uv1 semantic', () => {
    const geometry = createBoxMeshGeometry();
    expect(hasGlMeshGeometryUv1(geometry)).toBe(false);
  });

  it('returns true when the geometry layout carries a uv1 semantic', () => {
    const geometry = createBoxMeshGeometry();
    const withUv1 = {
      ...geometry,
      layout: {
        attributes: [
          ...geometry.layout.attributes,
          {
            byteOffset: geometry.layout.stride,
            format: 'float32x2',
            semantic: 'uv1',
          } as (typeof geometry.layout.attributes)[number],
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
