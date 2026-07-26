import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera/contract';
import { createVector3 } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d/contract';
import type { Camera3D, Scene3DLightsLike } from '@flighthq/types/contract';

import { drawGlScene3D } from './drawGlScene3D';
import {
  areGlScene3DColorSpaceGuardsEnabled,
  enableGlScene3DColorSpaceGuards,
} from './enableGlScene3DColorSpaceGuards';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerStandardPbrGlMaterial } from './registerStandardPbrGlMaterial';

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

describe('areGlScene3DColorSpaceGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlScene3DState();
    expect(areGlScene3DColorSpaceGuardsEnabled(state)).toBe(false);
    enableGlScene3DColorSpaceGuards(state);
    expect(areGlScene3DColorSpaceGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlScene3DColorSpaceGuards', () => {
  it('warns once when a scene is drawn directly to the canvas (no target to encode)', () => {
    const { state } = makeGlScene3DState();
    registerStandardPbrGlMaterial(state);
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableGlScene3DColorSpaceGuards(state);
      // No beginGlRenderPass: currentRenderTarget is null, so the scene draws straight to the canvas.
      drawGlScene3D(state, scene, makeCamera(), LIGHTS);
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('drawGlScene3D');
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
