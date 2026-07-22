import { setVector3 } from '@flighthq/geometry';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { invalidateNodeLocalTransform } from '@flighthq/node';
import { createMesh, createSceneNode } from '@flighthq/scene';
import type { MeshMorph } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createSkeleton3D } from './skeleton3d';
import { updateMeshDeformation } from './updateMeshDeformation';

describe('updateMeshDeformation', () => {
  it('recomposes changed morph weights before CPU skinning on every frame', () => {
    const vertices = new Float32Array(20);
    vertices[0] = 1;
    vertices[4] = 1;
    vertices[16] = 1;
    const mesh = createMesh(createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices }), []);
    const morph: MeshMorph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([2, 0, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    mesh.morph = morph;
    const joint = createSceneNode();
    mesh.skin = { skeleton: createSkeleton3D([joint]) };
    setVector3(joint.position, 0, 5, 0);
    invalidateNodeLocalTransform(joint);

    updateMeshDeformation(mesh);
    expect(Array.from(mesh.geometry.vertices.slice(0, 3))).toEqual([3, 5, 0]);

    morph.weights[0] = 3;
    updateMeshDeformation(mesh);
    expect(Array.from(mesh.geometry.vertices.slice(0, 3))).toEqual([7, 5, 0]);
  });

  it('preserves the standalone morph-only and skin-only cases', () => {
    const morphVertices = new Float32Array(20);
    morphVertices[16] = 1;
    const morphMesh = createMesh(
      createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices: morphVertices }),
      [],
    );
    morphMesh.morph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([2, 0, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    updateMeshDeformation(morphMesh);
    expect(morphMesh.geometry.vertices[0]).toBe(2);

    const skinVertices = new Float32Array(20);
    skinVertices[16] = 1;
    const skinMesh = createMesh(
      createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices: skinVertices }),
      [],
    );
    const joint = createSceneNode();
    skinMesh.skin = { skeleton: createSkeleton3D([joint]) };
    setVector3(joint.position, 0, 2, 0);
    invalidateNodeLocalTransform(joint);
    updateMeshDeformation(skinMesh);
    expect(skinMesh.geometry.vertices[1]).toBe(2);
  });
});
