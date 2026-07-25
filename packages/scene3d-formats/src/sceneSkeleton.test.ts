import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene3D, createNode3D } from '@flighthq/scene3d';
import { createSkeleton3D } from '@flighthq/skeleton3d';
import type { Node3D } from '@flighthq/types';

import { findScene3DSkeletonJoints } from './sceneSkeleton';
import { CANONICAL_LAYOUT } from './shared';

describe('findScene3DSkeletonJoints', () => {
  it('returns the joints of the first skinned mesh found in the scene', () => {
    const scene = createScene3D();
    const joint0 = createNode3D();
    const joint1 = createNode3D();
    const skeleton = createSkeleton3D([joint0, joint1], new Float32Array(32), null);
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) });
    const mesh = createMesh(geometry, []);
    mesh.skin = { skeleton, skeletonRoot: null };
    addNodeChild(scene.root, mesh as unknown as Node3D);

    expect(findScene3DSkeletonJoints(scene.root)).toBe(skeleton.joints);
  });

  it('returns null when the scene has no skinned mesh', () => {
    const scene = createScene3D();
    addNodeChild(
      scene.root,
      createMesh(
        createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) }),
        [],
      ) as unknown as Node3D,
    );
    expect(findScene3DSkeletonJoints(scene.root)).toBeNull();
  });
});
