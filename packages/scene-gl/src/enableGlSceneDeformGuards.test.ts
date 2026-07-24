import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, createMeshGeometry, createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createSceneNode, prepareSceneMorph, SceneNodeKind } from '@flighthq/scene';
import { createSkeleton3D, prepareSceneSkinning } from '@flighthq/skeleton3d';
import type { Camera3D, MeshMorph, SceneLightsLike } from '@flighthq/types';

import { drawGlScene } from './drawGlScene';
import { areGlSceneDeformGuardsEnabled, enableGlSceneDeformGuards } from './enableGlSceneDeformGuards';
import { makeGlSceneState } from './glSceneTestHelper';

function makeCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

const LIGHTS: SceneLightsLike = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

function morphMesh() {
  // A box geometry carrying a morph; drawn with no material so the guard (top of the mesh loop) runs
  // without exercising the material draw path.
  const mesh = createMesh(createBoxMeshGeometry(), []);
  const morph: MeshMorph = {
    targets: [{ normalDeltas: null, positionDeltas: new Float32Array(72), tangentDeltas: null }],
    weights: new Float32Array([1]),
  };
  mesh.morph = morph;
  return mesh;
}

function skinnedMesh() {
  const geometry = createMeshGeometry({
    layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
    vertices: new Float32Array(20),
  });
  const mesh = createMesh(geometry, []);
  mesh.skin = { skeleton: createSkeleton3D([createSceneNode()]) };
  return mesh;
}

function drawWithGuard(scene: ReturnType<typeof createSceneNode>): number {
  const { state } = makeGlSceneState();
  enableGlSceneDeformGuards(state);
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    drawGlScene(state, scene, makeCamera(), LIGHTS);
    return getMemoryLogSinkEntries(sink).length;
  } finally {
    removeLogSink(sink.sink);
  }
}

describe('areGlSceneDeformGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlSceneState();
    expect(areGlSceneDeformGuardsEnabled(state)).toBe(false);
    enableGlSceneDeformGuards(state);
    expect(areGlSceneDeformGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlSceneDeformGuards', () => {
  // Runs FIRST, before the fire cases below consume the logOnce keys: a prepared mesh must not reach the
  // warn branch at all, so this proves silence with fresh keys rather than relying on dedup to hide a bug.
  it('stays silent once the deform passes have run', () => {
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, morphMesh());
    addNodeChild(scene, skinnedMesh());
    // Ready both deformers, exactly as an app would before prepareSceneRender.
    prepareSceneMorph(scene);
    prepareSceneSkinning(scene);
    expect(drawWithGuard(scene)).toBe(0);
  });

  it('warns when a morphed mesh is drawn without prepareSceneMorph', () => {
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, morphMesh());
    expect(drawWithGuard(scene)).toBe(1);
  });

  it('warns when a GPU-skinned mesh is drawn without prepareSceneSkinning', () => {
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, skinnedMesh());
    expect(drawWithGuard(scene)).toBe(1);
  });
});
