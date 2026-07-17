import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { createSceneNode, setSceneNodePosition } from '@flighthq/scene';
import type { MeshGeometry } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { computeSkeleton3DJointMatrices, createSkeleton3D } from './skeleton3d';
import { captureMeshSkinBindPose, skinMeshGeometry } from './skinMeshGeometry';

// Builds a single-vertex geometry in the canonical skinned layout (20 floats): position, normal,
// tangent(0), uv0(0), joints0, weights0.
function createOneVertexSkinnedGeometry(
  position: readonly [number, number, number],
  normal: readonly [number, number, number],
  joints: readonly [number, number, number, number],
  weights: readonly [number, number, number, number],
): MeshGeometry {
  const vertices = new Float32Array(20);
  vertices[0] = position[0];
  vertices[1] = position[1];
  vertices[2] = position[2];
  vertices[3] = normal[0];
  vertices[4] = normal[1];
  vertices[5] = normal[2];
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
});

describe('skinMeshGeometry', () => {
  it('leaves the vertex at its bind position when the palette is identity', () => {
    const geometry = createOneVertexSkinnedGeometry([1, 0, 0], [0, 1, 0], [0, 0, 0, 0], [1, 0, 0, 0]);
    const joint = createSceneNode();
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
    const joint = createSceneNode();
    // Bind pose is captured with the joint at the origin (inverse-bind = identity), then the joint moves.
    const skeleton = createSkeleton3D([joint]);
    const bindPose = captureMeshSkinBindPose(geometry);
    setSceneNodePosition(joint, 0, 5, 0);

    computeSkeleton3DJointMatrices(skeleton);
    skinMeshGeometry(geometry, skeleton, bindPose);

    expect(geometry.vertices[0]).toBeCloseTo(1);
    expect(geometry.vertices[1]).toBeCloseTo(5);
    expect(geometry.vertices[2]).toBeCloseTo(0);
    // Normal (translation leaves it), and the static joints0/weights0 channels are untouched.
    expect(geometry.vertices[4]).toBeCloseTo(1);
    expect(geometry.vertices[16]).toBe(1);
  });
});
