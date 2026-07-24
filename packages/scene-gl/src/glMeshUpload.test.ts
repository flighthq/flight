import {
  createBoxMeshGeometry,
  createMeshGeometry,
  setMeshGeometrySkinBindPose,
  updateMeshMorph,
} from '@flighthq/mesh';
import type { Mesh, MeshSkinBindPose, VertexAttributeLayout, GlMeshUpload } from '@flighthq/types';

import { destroyGlMeshUpload, ensureGlMeshUpload } from './glMeshUpload';
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
      primitiveMode: gl.TRIANGLES,
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
    expect(upload.primitiveMode).toBe(gl.TRIANGLES);
    expect(gl.calls.some((c) => c.name === 'bufferData')).toBe(true);
  });

  it('reports the vertex count for a non-indexed upload', () => {
    const { state, gl } = makeGlSceneState();
    const layout: VertexAttributeLayout = {
      attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
      stride: 12,
    };
    const geometry = createMeshGeometry({ layout, vertices: new Float32Array(9) });
    const upload = ensureGlMeshUpload(state, geometry);

    expect(upload.indexBuffer).toBeNull();
    expect(upload.indexCount).toBe(3);
    expect(upload.primitiveMode).toBe(gl.TRIANGLES);
  });

  it('refreshes the primitive mode on a cached upload without re-uploading buffers', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureGlMeshUpload(state, geometry);
    const bufferDataCount = gl.calls.filter((call) => call.name === 'bufferData').length;

    geometry.topology = 'triangle-strip';
    const reused = ensureGlMeshUpload(state, geometry);

    expect(reused).toBe(upload);
    expect(reused.primitiveMode).toBe(gl.TRIANGLE_STRIP);
    expect(gl.calls.filter((call) => call.name === 'bufferData').length).toBe(bufferDataCount);
  });

  it('deletes an obsolete index buffer when geometry becomes non-indexed', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createBoxMeshGeometry();
    const upload = ensureGlMeshUpload(state, geometry);
    expect(upload.indexBuffer).not.toBeNull();

    geometry.indices = null;
    geometry.version++;
    ensureGlMeshUpload(state, geometry);

    expect(upload.indexBuffer).toBeNull();
    expect(gl.calls.filter((call) => call.name === 'deleteBuffer').length).toBe(1);
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

  it('converts packed integer storage into the float inputs declared by mesh shaders', () => {
    const { state, gl } = makeGlSceneState();
    const layout: VertexAttributeLayout = {
      attributes: [
        { byteOffset: 0, format: 'float32x3', semantic: 'position' },
        { byteOffset: 12, format: 'uint8x4', semantic: 'joints0' },
        { byteOffset: 16, format: 'unorm8x4', semantic: 'weights0' },
      ],
      stride: 20,
    };
    ensureGlMeshUpload(state, createMeshGeometry({ layout, vertices: new Float32Array(5) }));

    const jointCall = gl.calls.find((call) => call.name === 'vertexAttribPointer' && call.args[0] === 6);
    const weightCall = gl.calls.find((call) => call.name === 'vertexAttribPointer' && call.args[0] === 7);
    expect(jointCall?.args.slice(1)).toEqual([4, gl.UNSIGNED_BYTE, false, 20, 12]);
    expect(weightCall?.args.slice(1)).toEqual([4, gl.UNSIGNED_BYTE, true, 20, 16]);
    expect(gl.calls.some((call) => call.name === 'vertexAttribIPointer')).toBe(false);
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

  // Morph + skin compose on GPU: when a geometry is both morphed and GPU-skinned, the per-frame morphed
  // vertices (not the frozen skin bind pose) are what the shader skins, and they re-upload each frame.
  it('uploads the morphed vertices (not the frozen skin bind pose) for a morphed + GPU-skinned draw', () => {
    const { state, gl } = makeGlSceneState();
    const geometry = createMeshGeometry({
      layout: { attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }], stride: 12 },
      vertices: new Float32Array([1, 0, 0]),
    });
    // A captured skin bind pose at the rest position x = 1 — what the freeze would pin the buffer to.
    setMeshGeometrySkinBindPose(geometry, {
      joints: new Float32Array(0),
      normals: new Float32Array(3),
      positions: new Float32Array([1, 0, 0]),
      skinnedNormals: new Float32Array(0),
      skinnedPositions: new Float32Array(0),
      weights: new Float32Array(0),
    });

    // prepareSceneMorph blends the morph into geometry.vertices (x → 5) and captures the morph bind pose.
    const mesh = { geometry, materials: [], morph: undefined } as unknown as Mesh;
    mesh.morph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([4, 0, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    updateMeshMorph(mesh);

    ensureGlMeshUpload(state, geometry, true);
    const firstUpload = lastFloat32BufferData(gl.calls);
    // The morphed value (5), NOT the frozen skin bind (1): the morph is not discarded.
    expect(firstUpload[0]).toBeCloseTo(5);

    const uploadsAfterFirst = gl.calls.filter((c) => c.name === 'bufferData').length;

    // A moving morph weight re-uploads the freshly-morphed bind (x → 9), unlike the skin-only freeze.
    mesh.morph!.weights[0] = 2;
    updateMeshMorph(mesh);
    ensureGlMeshUpload(state, geometry, true);
    expect(gl.calls.filter((c) => c.name === 'bufferData').length).toBeGreaterThan(uploadsAfterFirst);
    expect(lastFloat32BufferData(gl.calls)[0]).toBeCloseTo(9);
  });
});

function lastFloat32BufferData(calls: readonly { name: string; args: readonly unknown[] }[]): Float32Array {
  const data = calls
    .filter((c) => c.name === 'bufferData')
    .map((c) => c.args[1])
    .filter((d): d is Float32Array => d instanceof Float32Array);
  return data[data.length - 1]!;
}
