import { setQuaternion, setVector3 } from '@flighthq/geometry/contract';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh/contract';
import { invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { createNode3D } from '@flighthq/scene3d/contract';
import type { MeshGeometry, VertexAttributeLayout } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { computeSkeleton3DJointMatrices, createSkeleton3D } from './skeleton3d';
import { captureMeshSkinBindPose, skinMeshGeometry, updateMeshSkinBindPoseDeformInput } from './skinMeshGeometry';

// Builds a single-vertex geometry in the canonical skinned layout (20 floats): position, normal,
// tangent(0), uv0(0), joints0, weights0.
function createOneVertexSkinnedGeometry(
  position: readonly [number, number, number],
  normal: readonly [number, number, number],
  joints: readonly [number, number, number, number],
  weights: readonly [number, number, number, number],
  tangent: readonly [number, number, number, number] = [0, 0, 0, 0],
): MeshGeometry {
  const vertices = new Float32Array(20);
  vertices[0] = position[0];
  vertices[1] = position[1];
  vertices[2] = position[2];
  vertices[3] = normal[0];
  vertices[4] = normal[1];
  vertices[5] = normal[2];
  vertices.set(tangent, 6);
  vertices.set(joints, 12);
  vertices.set(weights, 16);
  return createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices });
}

describe('captureMeshSkinBindPose', () => {
  it('de-interleaves positions, normals, joints and weights from the skinned layout', () => {
    const geometry = createOneVertexSkinnedGeometry([1, 2, 3], [0, 1, 0], [2, 0, 0, 0], [1, 0, 0, 0]);

    const bindPose = captureMeshSkinBindPose(geometry);

    expect(Array.from(bindPose.positions)).toEqual([1, 2, 3]);
    expect(Array.from(bindPose.normals)).toEqual([0, 1, 0]);
    expect(bindPose.joints[0]).toBe(2);
    expect(bindPose.weights[0]).toBe(1);
    expect(bindPose.skinnedPositions.length).toBe(3);
    expect(bindPose.skinnedNormals.length).toBe(3);
  });

  it('decodes packed joint and weight channels through the shared mesh attribute contract', () => {
    const layout: VertexAttributeLayout = {
      attributes: [
        { byteOffset: 0, format: 'float32x3', semantic: 'position' },
        { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
        { byteOffset: 24, format: 'uint8x4', semantic: 'joints0' },
        { byteOffset: 28, format: 'unorm8x4', semantic: 'weights0' },
      ],
      stride: 32,
    };
    const vertices = new Float32Array(8);
    vertices.set([1, 2, 3, 0, 1, 0]);
    const view = new DataView(vertices.buffer);
    view.setUint8(24, 3);
    view.setUint8(25, 2);
    view.setUint8(26, 1);
    view.setUint8(27, 0);
    view.setUint8(28, 128);
    view.setUint8(29, 64);
    view.setUint8(30, 32);
    view.setUint8(31, 31);

    const bindPose = captureMeshSkinBindPose(createMeshGeometry({ layout, vertices }));

    expect(Array.from(bindPose.joints)).toEqual([3, 2, 1, 0]);
    expect(bindPose.weights[0]).toBeCloseTo(128 / 255);
    expect(bindPose.weights[1]).toBeCloseTo(64 / 255);
    expect(bindPose.weights[2]).toBeCloseTo(32 / 255);
    expect(bindPose.weights[3]).toBeCloseTo(31 / 255);
  });
});

describe('skinMeshGeometry', () => {
  it('leaves the vertex at its bind position when the palette is identity', () => {
    const geometry = createOneVertexSkinnedGeometry([1, 0, 0], [0, 1, 0], [0, 0, 0, 0], [1, 0, 0, 0]);
    const joint = createNode3D();
    const skeleton = createSkeleton3D([joint]);
    const bindPose = captureMeshSkinBindPose(geometry);
    const versionBefore = geometry.version;

    computeSkeleton3DJointMatrices(skeleton);
    skinMeshGeometry(geometry, skeleton, bindPose);

    expect(geometry.vertices[0]).toBeCloseTo(1);
    expect(geometry.vertices[1]).toBeCloseTo(0);
    expect(geometry.vertices[2]).toBeCloseTo(0);
    expect(geometry.version).toBe(versionBefore + 1);
  });

  it('translates the vertex by a translated joint and preserves the untouched channels', () => {
    const geometry = createOneVertexSkinnedGeometry([1, 0, 0], [0, 1, 0], [0, 0, 0, 0], [1, 0, 0, 0]);
    const joint = createNode3D();
    // Bind pose is captured with the joint at the origin (inverse-bind = identity), then the joint moves.
    const skeleton = createSkeleton3D([joint]);
    const bindPose = captureMeshSkinBindPose(geometry);
    setVector3(joint.position, 0, 5, 0);
    invalidateNodeLocalTransform(joint);

    computeSkeleton3DJointMatrices(skeleton);
    skinMeshGeometry(geometry, skeleton, bindPose);

    expect(geometry.vertices[0]).toBeCloseTo(1);
    expect(geometry.vertices[1]).toBeCloseTo(5);
    expect(geometry.vertices[2]).toBeCloseTo(0);
    // Normal (translation leaves it), and the static joints0/weights0 channels are untouched.
    expect(geometry.vertices[4]).toBeCloseTo(1);
    expect(geometry.vertices[16]).toBe(1);
  });

  it('rewrites the tangent channel in the geometry, not just the scratch', () => {
    // ★ THIS IS THE ONE THAT CATCHES A MISSING WRITE-BACK. Every unit test of the blend itself passes
    // while `skinMeshGeometry` never copies the result into `geometry.vertices`, because those tests
    // call the blend directly. Only reading the interleaved buffer after a skin proves the channel was
    // actually updated. A rotation is required to see it: under a translation a correct tangent and an
    // un-skinned one are identical, so the assertion could not fail.
    const geometry = createOneVertexSkinnedGeometry([1, 0, 0], [0, 1, 0], [0, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, -1]);
    const joint = createNode3D();
    const skeleton = createSkeleton3D([joint]);
    const bindPose = captureMeshSkinBindPose(geometry);
    // 90 degrees about Z.
    setQuaternion(joint.rotation, 0, 0, Math.SQRT1_2, Math.SQRT1_2);
    invalidateNodeLocalTransform(joint);

    computeSkeleton3DJointMatrices(skeleton);
    skinMeshGeometry(geometry, skeleton, bindPose);

    // Tangent occupies floats 6..9: x rotates onto +y.
    expect(geometry.vertices[6]).toBeCloseTo(0);
    expect(geometry.vertices[7]).toBeCloseTo(1);
    expect(geometry.vertices[8]).toBeCloseTo(0);
    // w is handedness and must survive untouched, including the negative sign.
    expect(geometry.vertices[9]).toBe(-1);
  });

  it('keeps the skinned tangent orthogonal to the skinned normal', () => {
    // The user-visible defect: normal skinned, tangent frozen at bind pose, so N·T drifted off zero in
    // every pose away from bind. Read back from the interleaved buffer, which is what the shader sees.
    const geometry = createOneVertexSkinnedGeometry([1, 0, 0], [0, 1, 0], [0, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 1]);
    const joint = createNode3D();
    const skeleton = createSkeleton3D([joint]);
    const bindPose = captureMeshSkinBindPose(geometry);
    setQuaternion(joint.rotation, 0, 0, Math.SQRT1_2, Math.SQRT1_2);
    invalidateNodeLocalTransform(joint);

    computeSkeleton3DJointMatrices(skeleton);
    skinMeshGeometry(geometry, skeleton, bindPose);

    // ★ NON-DEGENERACY FIRST. A zero tangent is orthogonal to everything, so the dot product below
    // passes trivially on an un-skinned or unwritten channel — which it did, while the write-back was
    // in fact missing. Requiring a real length is what makes the orthogonality assertion mean anything.
    const length = Math.hypot(geometry.vertices[6], geometry.vertices[7], geometry.vertices[8]);
    expect(length).toBeCloseTo(1);

    const dot =
      geometry.vertices[3] * geometry.vertices[6] +
      geometry.vertices[4] * geometry.vertices[7] +
      geometry.vertices[5] * geometry.vertices[8];
    expect(dot).toBeCloseTo(0);
  });
});

describe('updateMeshSkinBindPoseDeformInput', () => {
  it('refreshes positions and normals without replacing static influences or scratch', () => {
    const geometry = createOneVertexSkinnedGeometry([1, 2, 3], [0, 1, 0], [2, 0, 0, 0], [1, 0, 0, 0]);
    const bindPose = captureMeshSkinBindPose(geometry);
    const joints = bindPose.joints;
    const weights = bindPose.weights;
    const scratch = bindPose.skinnedPositions;
    geometry.vertices[0] = 4;
    geometry.vertices[1] = 5;
    geometry.vertices[2] = 6;
    geometry.vertices[3] = 1;
    geometry.vertices[4] = 0;
    geometry.vertices[5] = 0;

    updateMeshSkinBindPoseDeformInput(bindPose, geometry);

    expect(Array.from(bindPose.positions)).toEqual([4, 5, 6]);
    expect(Array.from(bindPose.normals)).toEqual([1, 0, 0]);
    expect(bindPose.joints).toBe(joints);
    expect(bindPose.weights).toBe(weights);
    expect(bindPose.skinnedPositions).toBe(scratch);
  });
});
