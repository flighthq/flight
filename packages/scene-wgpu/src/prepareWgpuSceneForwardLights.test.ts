import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createPointLight, createSpotLight } from '@flighthq/lighting';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { prepareSceneRender } from '@flighthq/render';
import { createMesh, createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { Camera3D, SceneLightsLike } from '@flighthq/types';
import { SCENE_LIGHT_POINT_OFFSET } from '@flighthq/types';

import { prepareWgpuSceneForwardLights } from './prepareWgpuSceneForwardLights';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';

function camera(): Camera3D {
  const result = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 2, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(result, { x: 4, y: 0, z: 20 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return result;
}

function clusteredLights(): SceneLightsLike {
  return {
    ambient: null,
    directional: null,
    point: [8, 8, 8, 8, 0, 0, 0, 0].map((x, index) =>
      createPointLight({ position: { x, y: index % 4, z: 0 }, range: -1 }),
    ),
  };
}

describe('prepareWgpuSceneForwardLights', () => {
  it('packs independent four-light point and spot budgets', () => {
    const { state } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), []));
    const lights: SceneLightsLike = {
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
    const block = prepareWgpuSceneForwardLights(state, prepareSceneRender(state, scene, camera(), lights), lights)
      .meshLightBlocks[0];
    expect(block.pointCount).toBe(4);
    expect(block.spotCount).toBe(4);
  });

  it('selects per visible mesh, deduplicates tuples, and reuses scratch', () => {
    const { state } = makeWgpuSceneState();
    const scene = createSceneNode(SceneNodeKind);
    const nearA = createMesh(createBoxMeshGeometry(), []);
    const nearB = createMesh(createBoxMeshGeometry(), []);
    nearB.position.x = 0.1;
    const far = createMesh(createBoxMeshGeometry(), []);
    far.position.x = 8;
    addNodeChild(scene, nearA);
    addNodeChild(scene, nearB);
    addNodeChild(scene, far);
    const lights = clusteredLights();
    const renderList = prepareSceneRender(state, scene, camera(), lights);
    const first = prepareWgpuSceneForwardLights(state, renderList, lights);
    const blocks = first.meshLightBlocks;

    expect(first.meshCount).toBe(3);
    expect(blocks[0]).toBe(blocks[1]);
    expect(blocks[0]).not.toBe(blocks[2]);
    expect(blocks[0].data[SCENE_LIGHT_POINT_OFFSET]).toBe(0);
    expect(blocks[2].data[SCENE_LIGHT_POINT_OFFSET]).toBe(8);
    expect(prepareWgpuSceneForwardLights(state, renderList, lights)).toBe(first);
    expect(first.meshLightBlocks).toBe(blocks);
  });
});
