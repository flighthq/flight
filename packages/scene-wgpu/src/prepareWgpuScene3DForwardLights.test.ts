import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createPointLight, createSpotLight } from '@flighthq/lighting';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { prepareScene3DRender } from '@flighthq/render';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene';
import type { Camera3D, Scene3DLightsLike } from '@flighthq/types';
import { SCENE_LIGHT_POINT_OFFSET } from '@flighthq/types';

import { prepareWgpuScene3DForwardLights } from './prepareWgpuScene3DForwardLights';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

function camera(): Camera3D {
  const result = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 2, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(result, { x: 4, y: 0, z: 20 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return result;
}

function clusteredLights(): Scene3DLightsLike {
  return {
    ambient: null,
    directional: null,
    point: [8, 8, 8, 8, 0, 0, 0, 0].map((x, index) =>
      createPointLight({ position: { x, y: index % 4, z: 0 }, range: -1 }),
    ),
  };
}

describe('prepareWgpuScene3DForwardLights', () => {
  it('packs independent four-light point and spot budgets', () => {
    const { state } = makeWgpuScene3DState();
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), []));
    const lights: Scene3DLightsLike = {
      ambient: null,
      directional: null,
      point: Array.from({ length: 6 }, (_, index) =>
        createPointLight({ position: { x: index + 1, y: 0, z: 0 }, range: -1 }),
      ),
      spot: Array.from({ length: 6 }, (_, index) =>
        createSpotLight({
          direction: { x: -1, y: 0, z: 0 },
          innerConeDegrees: 45,
          outerConeDegrees: 60,
          position: { x: index + 1, y: 0, z: 0 },
          range: -1,
        }),
      ),
    };
    const block = prepareWgpuScene3DForwardLights(state, prepareScene3DRender(state, scene, camera(), lights), lights)
      .meshLightBlocks[0];
    expect(block.pointCount).toBe(4);
    expect(block.spotCount).toBe(4);
  });

  it('selects per visible mesh, deduplicates tuples, and reuses scratch', () => {
    const { state } = makeWgpuScene3DState();
    const scene = createNode3D(Node3DKind);
    const nearA = createMesh(createBoxMeshGeometry(), []);
    const nearB = createMesh(createBoxMeshGeometry(), []);
    nearB.position.x = 0.1;
    const far = createMesh(createBoxMeshGeometry(), []);
    far.position.x = 8;
    addNodeChild(scene, nearA);
    addNodeChild(scene, nearB);
    addNodeChild(scene, far);
    const lights = clusteredLights();
    const renderList = prepareScene3DRender(state, scene, camera(), lights);
    const first = prepareWgpuScene3DForwardLights(state, renderList, lights);
    const blocks = first.meshLightBlocks;

    expect(first.meshCount).toBe(3);
    expect(blocks[0]).toBe(blocks[1]);
    expect(blocks[0]).not.toBe(blocks[2]);
    expect(blocks[0].data[SCENE_LIGHT_POINT_OFFSET]).toBe(0);
    expect(blocks[2].data[SCENE_LIGHT_POINT_OFFSET]).toBe(8);
    expect(prepareWgpuScene3DForwardLights(state, renderList, lights)).toBe(first);
    expect(first.meshLightBlocks).toBe(blocks);
  });
});
