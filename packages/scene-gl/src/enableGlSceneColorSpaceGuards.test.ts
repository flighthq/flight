import { createCamera, setCameraViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene } from '@flighthq/scene';
import type { Camera, SceneLights } from '@flighthq/types';

import { drawGlScene } from './drawGlScene';
import { areGlSceneColorSpaceGuardsEnabled, enableGlSceneColorSpaceGuards } from './enableGlSceneColorSpaceGuards';
import { makeGlSceneState } from './glSceneTestHelper';
import { registerStandardPbrGlMaterial } from './registerStandardPbrGlMaterial';

function makeCamera(): Camera {
  const camera = createCamera({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCameraViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

const LIGHTS: SceneLights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

describe('areGlSceneColorSpaceGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlSceneState();
    expect(areGlSceneColorSpaceGuardsEnabled(state)).toBe(false);
    enableGlSceneColorSpaceGuards(state);
    expect(areGlSceneColorSpaceGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlSceneColorSpaceGuards', () => {
  it('warns once when a scene is drawn directly to the canvas (no target to encode)', () => {
    const { state } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);
    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableGlSceneColorSpaceGuards(state);
      // No beginGlRenderPass: currentRenderTarget is null, so the scene draws straight to the canvas.
      drawGlScene(state, scene, makeCamera(), LIGHTS);
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('drawGlScene');
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
