import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera/contract';
import { createVector3 } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import {
  addLogSink,
  clearLogOnceKeys,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  createMeshGeometry,
  createBoxMeshGeometry,
} from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createNode3D, prepareScene3DMorph, Node3DKind } from '@flighthq/scene3d/contract';
import { createSkeleton3D, prepareScene3DSkinning } from '@flighthq/skeleton3d/contract';
import type { Camera3D, MeshMorph, Scene3DLightsLike } from '@flighthq/types/contract';
import { beforeEach } from 'vitest';

import { drawGlScene3D } from './drawGlScene3D';
import { areGlScene3DDeformGuardsEnabled, enableGlScene3DDeformGuards } from './enableGlScene3DDeformGuards';
import { makeGlScene3DState } from './glScene3DTestHelper';

beforeEach(() => {
  clearLogOnceKeys();
});

function makeCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

const LIGHTS: Scene3DLightsLike = {
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
  mesh.skin = { skeleton: createSkeleton3D([createNode3D()]) };
  return mesh;
}

function drawWithGuard(scene: ReturnType<typeof createNode3D>): number {
  const { state } = makeGlScene3DState();
  enableGlScene3DDeformGuards(state);
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    drawGlScene3D(state, scene, makeCamera(), LIGHTS);
    return getMemoryLogSinkEntries(sink).length;
  } finally {
    removeLogSink(sink.sink);
  }
}

describe('areGlScene3DDeformGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlScene3DState();
    expect(areGlScene3DDeformGuardsEnabled(state)).toBe(false);
    enableGlScene3DDeformGuards(state);
    expect(areGlScene3DDeformGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlScene3DDeformGuards', () => {
  it('stays silent once the deform passes have run', () => {
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, morphMesh());
    addNodeChild(scene, skinnedMesh());
    // Ready both deformers, exactly as an app would before prepareScene3DRender.
    prepareScene3DMorph(scene);
    prepareScene3DSkinning(scene);
    expect(drawWithGuard(scene)).toBe(0);
  });

  it('warns when a morphed mesh is drawn without prepareScene3DMorph', () => {
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, morphMesh());
    expect(drawWithGuard(scene)).toBe(1);
  });

  it('warns when a GPU-skinned mesh is drawn without prepareScene3DSkinning', () => {
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, skinnedMesh());
    expect(drawWithGuard(scene)).toBe(1);
  });
});
