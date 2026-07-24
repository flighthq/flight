import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createPointLight, createSpotLight } from '@flighthq/lighting';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { prepareSceneRender } from '@flighthq/render';
import { createMesh, createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { Camera3D, SceneLightsLike } from '@flighthq/types';
import { SCENE_LIGHT_POINT_OFFSET } from '@flighthq/types';

import { makeGlSceneState } from './glSceneTestHelper';
import { prepareGlSceneForwardLights } from './prepareGlSceneForwardLights';

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
    point: [
      createPointLight({ position: { x: 8, y: 0, z: 0 }, range: -1 }),
      createPointLight({ position: { x: 8, y: 1, z: 0 }, range: -1 }),
      createPointLight({ position: { x: 8, y: -1, z: 0 }, range: -1 }),
      createPointLight({ position: { x: 8, y: 0, z: 1 }, range: -1 }),
      createPointLight({ position: { x: 0, y: 0, z: 0 }, range: -1 }),
      createPointLight({ position: { x: 0, y: 1, z: 0 }, range: -1 }),
      createPointLight({ position: { x: 0, y: -1, z: 0 }, range: -1 }),
      createPointLight({ position: { x: 0, y: 0, z: 1 }, range: -1 }),
    ],
  };
}

describe('prepareGlSceneForwardLights', () => {
  it('packs four selected points and four selected spots from independent family budgets', () => {
    const { state } = makeGlSceneState();
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
    const renderList = prepareSceneRender(state, scene, camera(), lights);
    const block = prepareGlSceneForwardLights(state, renderList, lights).meshLightBlocks[0];
    expect(block.pointCount).toBe(4);
    expect(block.spotCount).toBe(4);
  });

  it('selects punctual lights per visible mesh and deduplicates identical tuples', () => {
    const { state } = makeGlSceneState();
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
    const selected = prepareGlSceneForwardLights(state, renderList, lights);

    expect(selected.meshCount).toBe(3);
    expect(selected.meshLightBlocks[0]).toBe(selected.meshLightBlocks[1]);
    expect(selected.meshLightBlocks[0]).not.toBe(selected.meshLightBlocks[2]);
    expect(selected.meshLightBlocks[0].pointCount).toBe(4);
    expect(selected.meshLightBlocks[0].data[SCENE_LIGHT_POINT_OFFSET]).toBe(0);
    expect(selected.meshLightBlocks[2].data[SCENE_LIGHT_POINT_OFFSET]).toBe(8);
  });

  it('reuses its list, mesh array, and packed blocks across frames', () => {
    const { state } = makeGlSceneState();
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), []));
    const lights = clusteredLights();
    const renderList = prepareSceneRender(state, scene, camera(), lights);
    const first = prepareGlSceneForwardLights(state, renderList, lights);
    const meshBlocks = first.meshLightBlocks;
    const block = first.meshLightBlocks[0];

    const second = prepareGlSceneForwardLights(state, renderList, lights);
    expect(second).toBe(first);
    expect(second.meshLightBlocks).toBe(meshBlocks);
    expect(second.meshLightBlocks[0]).toBe(block);
  });
});
