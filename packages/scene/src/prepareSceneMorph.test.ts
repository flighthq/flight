import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { MeshMorph, VertexAttributeLayout } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMesh } from './mesh';
import { prepareSceneMorph } from './prepareSceneMorph';
import { createSceneNode } from './sceneNode';

const POSITION_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

function morphedMesh(positions: readonly number[], deltas: readonly number[], weight: number) {
  const geometry = createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array(positions) });
  const mesh = createMesh(geometry, []);
  const morph: MeshMorph = {
    targets: [{ normalDeltas: null, positionDeltas: new Float32Array(deltas), tangentDeltas: null }],
    weights: new Float32Array([weight]),
  };
  mesh.morph = morph;
  return mesh;
}

describe('prepareSceneMorph', () => {
  it('blends every morphed mesh in the subtree into its geometry', () => {
    const scene = createSceneNode();
    const a = morphedMesh([0, 0, 0], [1, 0, 0], 1);
    const group = createSceneNode();
    const b = morphedMesh([0, 0, 0], [0, 2, 0], 1);
    addNodeChild(group, b);
    addNodeChild(scene, a);
    addNodeChild(scene, group);

    prepareSceneMorph(scene);

    expect(a.geometry.vertices[0]).toBe(1);
    expect(b.geometry.vertices[1]).toBe(2);
  });

  it('skips disabled subtrees', () => {
    const scene = createSceneNode();
    const disabled = createSceneNode(undefined, { enabled: false });
    const mesh = morphedMesh([0, 0, 0], [5, 0, 0], 1);
    addNodeChild(disabled, mesh);
    addNodeChild(scene, disabled);

    prepareSceneMorph(scene);

    // Untouched: the disabled subtree is never walked.
    expect(mesh.geometry.vertices[0]).toBe(0);
  });

  it('is a no-op for a scene with no morphed meshes', () => {
    const scene = createSceneNode();
    const rigid = createMesh(
      createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array([3, 3, 3]) }),
      [],
    );
    addNodeChild(scene, rigid);
    const version = rigid.geometry.version;

    prepareSceneMorph(scene);

    expect(rigid.geometry.version).toBe(version);
  });
});
