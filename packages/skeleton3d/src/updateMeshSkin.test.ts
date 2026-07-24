import { setVector3 } from '@flighthq/geometry';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  createMeshGeometry,
  ensureMeshGeometryBounds,
  getMeshGeometrySkinBindPose,
} from '@flighthq/mesh';
import { invalidateNodeLocalTransform } from '@flighthq/node';
import { createMesh, createSceneNode } from '@flighthq/scene';
import { describe, expect, it } from 'vitest';

import { createSkeleton3D } from './skeleton3d';
import { updateMeshSkin } from './updateMeshSkin';

function createOneVertexSkinnedMesh() {
  const vertices = new Float32Array(20);
  vertices[0] = 1; // position x
  vertices[4] = 1; // normal y
  vertices[16] = 1; // weights0[0]
  const geometry = createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices });
  return createMesh(geometry, []);
}

describe('updateMeshSkin', () => {
  it('deforms the mesh, bumps the version, and lazily captures the bind pose onto the runtime', () => {
    const mesh = createOneVertexSkinnedMesh();
    const joint = createSceneNode();
    mesh.skin = { skeleton: createSkeleton3D([joint]) };
    setVector3(joint.position, 0, 5, 0);
    invalidateNodeLocalTransform(joint);
    const versionBefore = mesh.geometry.version;

    expect(getMeshGeometrySkinBindPose(mesh.geometry)).toBeNull();

    updateMeshSkin(mesh);

    expect(mesh.geometry.vertices[1]).toBeCloseTo(5);
    // Bounds are a dirty-gated cache: the skin marks them stale, the ensure recomputes them.
    const bounds = ensureMeshGeometryBounds(mesh.geometry);
    expect(bounds?.min.y).toBeCloseTo(5);
    expect(bounds?.max.y).toBeCloseTo(5);
    expect(mesh.geometry.version).toBe(versionBefore + 1);
    expect(getMeshGeometrySkinBindPose(mesh.geometry)).not.toBeNull();
  });

  it('reuses the captured bind pose across frames rather than recapturing', () => {
    const mesh = createOneVertexSkinnedMesh();
    const joint = createSceneNode();
    mesh.skin = { skeleton: createSkeleton3D([joint]) };

    updateMeshSkin(mesh);
    const bindPose = getMeshGeometrySkinBindPose(mesh.geometry);
    updateMeshSkin(mesh);

    expect(getMeshGeometrySkinBindPose(mesh.geometry)).toBe(bindPose);
  });

  it('is a no-op for a mesh with no skin', () => {
    const mesh = createOneVertexSkinnedMesh();
    const versionBefore = mesh.geometry.version;

    updateMeshSkin(mesh);

    expect(mesh.geometry.version).toBe(versionBefore);
    expect(getMeshGeometrySkinBindPose(mesh.geometry)).toBeNull();
  });
});
