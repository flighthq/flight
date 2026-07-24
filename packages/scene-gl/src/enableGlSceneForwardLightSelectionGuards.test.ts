import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createPointLight } from '@flighthq/lighting';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { prepareSceneRender } from '@flighthq/render';
import { createMesh, createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { Camera3D, SceneLightsLike } from '@flighthq/types';

import { drawGlScene } from './drawGlScene';
import {
  areGlSceneForwardLightSelectionGuardsEnabled,
  enableGlSceneForwardLightSelectionGuards,
} from './enableGlSceneForwardLightSelectionGuards';
import { makeGlSceneState } from './glSceneTestHelper';
import { prepareGlSceneForwardLights } from './prepareGlSceneForwardLights';
import { registerStandardPbrGlMaterial } from './registerStandardPbrGlMaterial';

function camera(): Camera3D {
  const result = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(result, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return result;
}

function excessLights(): SceneLightsLike {
  return {
    ambient: null,
    directional: null,
    point: Array.from({ length: 5 }, (_, x) => createPointLight({ position: { x: x - 2, y: 0, z: 2 }, range: 10 })),
  };
}

describe('areGlSceneForwardLightSelectionGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlSceneState();
    expect(areGlSceneForwardLightSelectionGuardsEnabled(state)).toBe(false);
    enableGlSceneForwardLightSelectionGuards(state);
    expect(areGlSceneForwardLightSelectionGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlSceneForwardLightSelectionGuards', () => {
  it('warns when excess punctual lights draw without a prepared selection', () => {
    const { state } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);
    enableGlSceneForwardLightSelectionGuards(state);
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      drawGlScene(state, scene, camera(), excessLights());
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('prepareGlSceneForwardLights');
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('stays silent when the explicit per-object selection is supplied', () => {
    const { state } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);
    enableGlSceneForwardLightSelectionGuards(state);
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const view = camera();
    const lights = excessLights();
    const selected = prepareGlSceneForwardLights(state, prepareSceneRender(state, scene, view, lights), lights);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      drawGlScene(state, scene, view, lights, selected);
      expect(getMemoryLogSinkEntries(sink)).toHaveLength(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
