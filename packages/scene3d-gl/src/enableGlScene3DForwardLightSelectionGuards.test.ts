import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createPointLight } from '@flighthq/lighting';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { prepareScene3DRender } from '@flighthq/render';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d';
import type { Camera3D, Scene3DLightsLike } from '@flighthq/types';

import { drawGlScene3D } from './drawGlScene3D';
import {
  areGlScene3DForwardLightSelectionGuardsEnabled,
  enableGlScene3DForwardLightSelectionGuards,
} from './enableGlScene3DForwardLightSelectionGuards';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { prepareGlScene3DForwardLights } from './prepareGlScene3DForwardLights';
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

function excessLights(): Scene3DLightsLike {
  return {
    ambient: null,
    directional: null,
    point: Array.from({ length: 5 }, (_, x) => createPointLight({ position: { x: x - 2, y: 0, z: 2 }, range: 10 })),
  };
}

describe('areGlScene3DForwardLightSelectionGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlScene3DState();
    expect(areGlScene3DForwardLightSelectionGuardsEnabled(state)).toBe(false);
    enableGlScene3DForwardLightSelectionGuards(state);
    expect(areGlScene3DForwardLightSelectionGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlScene3DForwardLightSelectionGuards', () => {
  it('warns when excess punctual lights draw without a prepared selection', () => {
    const { state } = makeGlScene3DState();
    registerStandardPbrGlMaterial(state);
    enableGlScene3DForwardLightSelectionGuards(state);
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      drawGlScene3D(state, scene, camera(), excessLights());
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('prepareGlScene3DForwardLights');
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('stays silent when the explicit per-object selection is supplied', () => {
    const { state } = makeGlScene3DState();
    registerStandardPbrGlMaterial(state);
    enableGlScene3DForwardLightSelectionGuards(state);
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const view = camera();
    const lights = excessLights();
    const selected = prepareGlScene3DForwardLights(state, prepareScene3DRender(state, scene, view, lights), lights);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      drawGlScene3D(state, scene, view, lights, selected);
      expect(getMemoryLogSinkEntries(sink)).toHaveLength(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
