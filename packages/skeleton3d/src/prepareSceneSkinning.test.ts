import { setVector3 } from '@flighthq/geometry';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  createMeshGeometry,
  getMeshGeometrySkinBindPose,
} from '@flighthq/mesh';
import { addNodeChild, getNodeRuntime, invalidateNodeLocalTransform } from '@flighthq/node';
import { createMesh, createSceneNode } from '@flighthq/scene';
import type { MeshRuntime } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { prepareMeshSkinning, prepareSceneSkinning } from './prepareSceneSkinning';
import { createSkeleton3D } from './skeleton3d';

function createOneVertexSkinnedMesh() {
  const vertices = new Float32Array(20);
  vertices[0] = 1; // position x
  vertices[4] = 1; // normal y
  vertices[16] = 1; // weights0[0]
  const geometry = createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices });
  return createMesh(geometry, []);
}

function deformedBounds(mesh: ReturnType<typeof createOneVertexSkinnedMesh>) {
  return (getNodeRuntime(mesh) as MeshRuntime).deformedLocalBounds;
}

describe('prepareMeshSkinning', () => {
  it('captures the bind pose and writes posed conservative bounds without CPU-posing the vertices', () => {
    const mesh = createOneVertexSkinnedMesh();
    const joint = createSceneNode();
    mesh.skin = { skeleton: createSkeleton3D([joint]) };
    setVector3(joint.position, 0, 5, 0);
    invalidateNodeLocalTransform(joint);
    const versionBefore = mesh.geometry.version;

    prepareMeshSkinning(mesh);

    // The bind pose is captured (read-only) so the bounds sweep has a rest pose to work from.
    expect(getMeshGeometrySkinBindPose(mesh.geometry)).not.toBeNull();
    // The GPU deforms the vertices in-shader, so the CPU buffer must stay at bind pose and NOT bump.
    expect(mesh.geometry.vertices[0]).toBe(1);
    expect(mesh.geometry.vertices[1]).toBe(0);
    expect(mesh.geometry.version).toBe(versionBefore);
    // The posed conservative bounds cover the joint-translated vertex (y ≈ 5).
    const bounds = deformedBounds(mesh);
    expect(bounds).not.toBeNull();
    expect(bounds!.max.y).toBeGreaterThanOrEqual(5 - 1e-6);
  });

  it('is a no-op for a rigid mesh and leaves the slot empty', () => {
    const mesh = createMesh(
      createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices: new Float32Array(20) }),
      [],
    );
    prepareMeshSkinning(mesh);
    expect(deformedBounds(mesh) ?? null).toBeNull();
  });

  it('reuses the same bounds AABB instance across frames', () => {
    const mesh = createOneVertexSkinnedMesh();
    const joint = createSceneNode();
    mesh.skin = { skeleton: createSkeleton3D([joint]) };
    setVector3(joint.position, 0, 5, 0);
    invalidateNodeLocalTransform(joint);

    prepareMeshSkinning(mesh);
    const first = deformedBounds(mesh);
    prepareMeshSkinning(mesh);
    expect(deformedBounds(mesh)).toBe(first);
  });
});

describe('prepareSceneSkinning', () => {
  it('poses every skinned mesh in the subtree and skips disabled subtrees', () => {
    const scene = createSceneNode();
    const skinned = createOneVertexSkinnedMesh();
    const joint = createSceneNode();
    skinned.skin = { skeleton: createSkeleton3D([joint]) };
    setVector3(joint.position, 0, 5, 0);
    invalidateNodeLocalTransform(joint);
    addNodeChild(scene, skinned);

    const disabledGroup = createSceneNode(undefined, { enabled: false });
    const hidden = createOneVertexSkinnedMesh();
    hidden.skin = { skeleton: createSkeleton3D([createSceneNode()]) };
    addNodeChild(disabledGroup, hidden);
    addNodeChild(scene, disabledGroup);

    prepareSceneSkinning(scene);

    expect(deformedBounds(skinned)).not.toBeNull();
    // A disabled subtree is skipped whole, so its skinned mesh is never posed.
    expect(getMeshGeometrySkinBindPose(hidden.geometry)).toBeNull();
    expect(deformedBounds(hidden) ?? null).toBeNull();
  });
});
