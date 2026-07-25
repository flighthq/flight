import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene, createSceneNode } from '@flighthq/scene';
import { createSkeleton3D } from '@flighthq/skeleton3d';
import type { SceneNode } from '@flighthq/types';

import { findSceneSkeletonJoints } from './sceneSkeleton';
import { CANONICAL_LAYOUT } from './shared';

describe('findSceneSkeletonJoints', () => {
  it('returns the joints of the first skinned mesh found in the scene', () => {
    const scene = createScene();
    const joint0 = createSceneNode();
    const joint1 = createSceneNode();
    const skeleton = createSkeleton3D([joint0, joint1], new Float32Array(32), null);
    const geometry = createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) });
    const mesh = createMesh(geometry, []);
    mesh.skin = { skeleton, skeletonRoot: null };
    addNodeChild(scene.root, mesh as unknown as SceneNode);

    expect(findSceneSkeletonJoints(scene.root)).toBe(skeleton.joints);
  });

  it('returns null when the scene has no skinned mesh', () => {
    const scene = createScene();
    addNodeChild(
      scene.root,
      createMesh(
        createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) }),
        [],
      ) as unknown as SceneNode,
    );
    expect(findSceneSkeletonJoints(scene.root)).toBeNull();
  });
});
