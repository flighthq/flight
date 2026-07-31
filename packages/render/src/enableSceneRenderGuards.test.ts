import {
  createCamera3D,
  createPerspectiveProjection,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/camera/contract';
import { createAabb } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import { setLogSink } from '@flighthq/log/contract';
import { computeMeshGeometryBounds, createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d/contract';
import type { Camera3D, LogEntry, Mesh, MeshGeometry, Skin } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { disableSceneRenderGuards, enableSceneRenderGuards } from './enableSceneRenderGuards';
import { createRenderState } from './renderState';
import { prepareScene3DRender } from './sceneRender';

let entries: LogEntry[];

beforeEach(() => {
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableSceneRenderGuards();
  setLogSink(null);
});

function messages(): string {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

function boundedBox(): MeshGeometry {
  const geometry = createBoxMeshGeometry(2, 2, 2);
  const bounds = createAabb();
  computeMeshGeometryBounds(bounds, geometry);
  geometry.bounds = bounds;
  return geometry;
}

function frontCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

function prepareWith(mesh: Mesh): void {
  const state = createRenderState();
  const scene = createNode3D(Node3DKind);
  addNodeChild(scene, mesh);
  prepareScene3DRender(state, scene, frontCamera(), {
    ambient: createAmbientLight(),
    directional: createDirectionalLight(),
  });
}

describe('disableSceneRenderGuards', () => {
  it('stops the guard reporting later frames', () => {
    enableSceneRenderGuards();
    disableSceneRenderGuards();
    const mesh = createMesh(boundedBox(), [null]);
    mesh.skin = {} as Skin;
    prepareWith(mesh);
    expect(messages()).toBe('');
  });
});

describe('enableSceneRenderGuards', () => {
  // A rigid mesh legitimately has no posed bounds — it never deforms — so warning about it would make
  // the guard noise on the common path and train people to ignore it.
  it('says nothing for a rigid mesh with no posed bounds', () => {
    enableSceneRenderGuards();
    prepareWith(createMesh(boundedBox(), [null]));
    expect(messages()).toBe('');
  });

  // The failure this catches is invisible where it happens: culling falls back to BIND POSE bounds and
  // a swung limb is removed from the frame, which reads as a culling or camera bug rather than a
  // missing call in the frame loop.
  it('warns when a skinned mesh reaches culling with no posed bounds', () => {
    enableSceneRenderGuards();
    const mesh = createMesh(boundedBox(), [null]);
    mesh.skin = {} as Skin;

    prepareWith(mesh);

    expect(messages()).toContain('BIND POSE');
    expect(messages()).toContain('prepareScene3DSkinning');
  });
});
